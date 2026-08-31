# -*- coding: utf-8 -*-
"""DART OpenAPI 호출 계층.

모든 네트워크 접근은 DartClient.call() 하나만 통과한다. 여기서 원본 보관, 호출 로그,
캐시, 키 마스킹, 쿼터 원장이 전부 처리된다. 다른 모듈은 절대 직접 HTTP 를 하지 않는다.
"""
from __future__ import annotations

import hashlib
import json
import os
import random
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import config

KST = timezone(timedelta(hours=9), "KST")
DAILY_QUOTA = 20000
UA = "lastprice-dart-collector/1.0 (+stdlib urllib)"


def now_kst() -> datetime:
    return datetime.now(KST)


def ts_kst() -> str:
    """timezone-aware ISO-8601. 재개된 실행끼리 순서가 뒤집히지 않도록 offset 을 남긴다."""
    return now_kst().isoformat(timespec="seconds")


def today_kst() -> str:
    return now_kst().strftime("%Y%m%d")


class FixtureMissing(Exception):
    """픽스처 트리에 해당 응답이 없다. 재시도 대상이 아니다."""


class FatalDartError(RuntimeError):
    """실행 전체를 중단시키는 오류 (키·한도·점검·전송 이상)."""

    def __init__(self, message, status=None, endpoint=None):
        super().__init__(message)
        self.status = status
        self.endpoint = endpoint


class Result:
    """한 번의 call() 결과. 행과 그 출처를 함께 들고 다닌다."""

    __slots__ = ("endpoint", "params", "kind", "status", "message", "http_status",
                 "body", "data", "raw_path", "raw_sha256", "fetched_at", "cached",
                 "call_id", "cache_age_days", "anomaly")

    def __init__(self, **kw):
        for k in self.__slots__:
            setattr(self, k, kw.get(k))

    @property
    def ok(self) -> bool:
        return self.status == "000"

    def rows(self) -> list:
        """list[] 를 돌려준다. status=000 인데 list 키가 아예 없는 경우도 있다."""
        if not isinstance(self.data, dict):
            return []
        v = self.data.get("list")
        return v if isinstance(v, list) else []

    def provenance(self, rcept_no="", rcept_no_source="none") -> dict:
        """모든 출력 행에 붙는 출처 컬럼. 요구사항 #1 의 구현체."""
        return {
            "source_endpoint": self.endpoint,
            "source_params": json.dumps(self.params, ensure_ascii=False, sort_keys=True),
            "rcept_no": rcept_no,
            "rcept_no_source": rcept_no_source,
            "fetched_at": self.fetched_at,
            "status": self.status,
            "call_id": self.call_id,
            "raw_path": self.raw_path,
            "raw_sha256": self.raw_sha256,
            "cached": "Y" if self.cached else "N",
            "cache_age_days": "" if self.cache_age_days is None else self.cache_age_days,
        }


# ── 원본 파일명 ────────────────────────────────────────────────────────────
def _san(v) -> str:
    return re.sub(r"[^0-9A-Za-z_.-]", "_", str(v))


def slug_for(endpoint: str, params: dict) -> str:
    """파라미터로부터 결정적 파일명을 만든다. 키는 절대 포함하지 않는다."""
    grain = config.ENDPOINTS[endpoint]["grain"]
    p = params
    if grain == "none":
        return endpoint
    if grain == "corp":
        return _san(p.get("corp_code"))
    if grain == "report":
        return "_".join(_san(p.get(k)) for k in ("corp_code", "bsns_year", "reprt_code"))
    if grain == "fs":
        return "_".join(_san(p.get(k)) for k in ("corp_code", "bsns_year", "reprt_code", "fs_div"))
    if grain == "list":
        return "%s_%s_%s_p%03d" % (_san(p.get("corp_code") or "ALL"), _san(p.get("bgn_de")),
                                   _san(p.get("end_de")), int(p.get("page_no", 1)))
    if grain == "rcept":
        return _san(p.get("rcept_no"))
    if grain == "taxo":
        return _san(p.get("sj_div"))
    # 알 수 없는 grain — 파라미터 해시로 안전하게 떨어뜨린다
    return hashlib.sha256(
        json.dumps(p, sort_keys=True).encode()).hexdigest()[:16]


# ── transport ─────────────────────────────────────────────────────────────
def urllib_transport(url: str, timeout: int):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    ctx = ssl.create_default_context()
    cab = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
    if os.path.exists(cab):
        try:
            ctx.load_verify_locations(cab)
        except Exception:
            pass
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.getcode(), r.read(), dict(r.headers)


class FixtureTransport:
    """오프라인 검증용. DART_FIXTURE_DIR 안에서 endpoint/slug 로 응답을 읽는다.

    블라인드로 작성한 코드를 사용자 머신에서 처음 실행하지 않기 위한 유일한 안전장치.
    """

    def __init__(self, root):
        self.root = root

    def __call__(self, url, timeout):
        parsed = urllib.parse.urlparse(url)
        endpoint = os.path.basename(parsed.path).split(".")[0]
        qs = dict(urllib.parse.parse_qsl(parsed.query))
        qs.pop("crtfc_key", None)
        ep_key = next((k for k, v in config.ENDPOINTS.items()
                       if v["path"].split(".")[0] == endpoint), endpoint)
        for name in self._candidates(ep_key, qs):
            for ext in (".json", ".zip", ".xml", ".bin"):
                p = os.path.join(self.root, ep_key, name + ext)
                if os.path.exists(p):
                    with open(p, "rb") as f:
                        return 200, f.read(), {}
        raise FixtureMissing("fixture missing: %s/%s" % (ep_key, qs))

    @staticmethod
    def _candidates(ep_key, qs):
        """느슨한 순서로 후보 이름을 만든다.

        list 는 end_de 에 '오늘' 이 들어가 슬러그가 날마다 달라지므로 날짜를 뺀
        이름으로도 찾을 수 있어야 한다.
        """
        out = []
        if ep_key in config.ENDPOINTS:
            out.append(slug_for(ep_key, qs))
            if config.ENDPOINTS[ep_key]["grain"] == "list":
                out.append("%s_p%03d" % (qs.get("corp_code") or "ALL",
                                         int(qs.get("page_no", 1))))
                out.append(str(qs.get("corp_code") or "ALL"))
        out.append("_default")
        return out


# ── 클라이언트 ────────────────────────────────────────────────────────────
class DartClient:
    def __init__(self, out_dir, delay=0.4, max_calls=5000, refresh=False,
                 refresh_status=(), max_age_days=None, dry_run=False,
                 timeout=30, doc_timeout=120, transport=None, require_key=True):
        self.out = os.path.abspath(out_dir)
        self.raw = os.path.join(self.out, "raw")
        self.delay = delay
        self.max_calls = max_calls
        self.refresh = refresh
        self.refresh_status = set(refresh_status or ())
        self.max_age_days = max_age_days
        self.dry_run = dry_run
        self.timeout = timeout
        self.doc_timeout = doc_timeout
        self.network_calls = 0
        self.plan_rows = []
        self._last_call = 0.0
        self._seq = 0

        fixture_dir = os.environ.get("DART_FIXTURE_DIR")
        if transport is not None:
            self.transport = transport
        elif fixture_dir:
            self.transport = FixtureTransport(fixture_dir)
        else:
            self.transport = urllib_transport

        self.key = os.environ.get("DART_API_KEY", "")
        if require_key and not self.key and not dry_run and not fixture_dir:
            raise SystemExit(
                "DART_API_KEY 환경변수가 필요합니다.\n"
                "  export DART_API_KEY=<opendart.fss.or.kr 에서 발급받은 40자 키>")
        self.key_fp = hashlib.sha256(self.key.encode()).hexdigest()[:8] if self.key else "nokey"

        self.run_id = now_kst().strftime("run_%Y%m%d_%H%M%S")
        self.script_sha = self._script_sha()
        os.makedirs(self.raw, exist_ok=True)
        self._init_logs()

    # ── 키 마스킹 ─────────────────────────────────────────────────────────
    def scrub(self, s) -> str:
        """디스크·로그로 나가는 모든 문자열의 최종 관문."""
        s = str(s)
        if self.key:
            s = s.replace(self.key, "***")
            s = s.replace(urllib.parse.quote(self.key), "***")
        return re.sub(r"(crtfc_key=)[^&\s\"']+", r"\1***", s)

    def _script_sha(self) -> str:
        h = hashlib.sha256()
        d = os.path.dirname(os.path.abspath(__file__))
        for fn in sorted(os.listdir(d)):
            if fn.endswith(".py"):
                with open(os.path.join(d, fn), "rb") as f:
                    h.update(f.read())
        return h.hexdigest()[:12]

    # ── 로그 ──────────────────────────────────────────────────────────────
    CALL_LOG_COLS = ["run_id", "script_sha", "call_id", "fetched_at", "server_date",
                     "phase", "endpoint", "url_redacted", "params_json", "http_status",
                     "api_status", "api_message", "n_rows", "elapsed_ms", "bytes",
                     "raw_path", "raw_sha256", "cached", "attempts", "anomaly"]

    def _init_logs(self):
        import csv
        self.call_log_path = os.path.join(self.out, "call_log.csv")
        if not os.path.exists(self.call_log_path):
            with open(self.call_log_path, "w", encoding="utf-8-sig", newline="") as f:
                csv.writer(f).writerow(self.CALL_LOG_COLS)
        runs = os.path.join(self.out, "runs.csv")
        new = not os.path.exists(runs)
        with open(runs, "a", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f)
            if new:
                w.writerow(["run_id", "started_at", "script_sha", "key_fingerprint", "argv"])
            w.writerow([self.run_id, ts_kst(), self.script_sha, self.key_fp,
                        self.scrub(" ".join(sys.argv))])

    def _log_call(self, row):
        import csv
        with open(self.call_log_path, "a", encoding="utf-8-sig", newline="") as f:
            csv.writer(f).writerow([self.scrub(row.get(c, "")) for c in self.CALL_LOG_COLS])

    # ── 쿼터 원장 ─────────────────────────────────────────────────────────
    def _ledger_path(self):
        return os.path.join(self.out, "quota_ledger.csv")

    def quota_used_today(self) -> int:
        import csv
        p, day, total = self._ledger_path(), today_kst(), 0
        if not os.path.exists(p):
            return 0
        with open(p, encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                if r.get("date") == day and r.get("key_fingerprint") == self.key_fp:
                    total += int(r.get("calls") or 0)
        return total

    def _ledger_add(self, n=1):
        import csv
        p = self._ledger_path()
        new = not os.path.exists(p)
        with open(p, "a", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f)
            if new:
                w.writerow(["date", "key_fingerprint", "run_id", "calls", "at"])
            w.writerow([today_kst(), self.key_fp, self.run_id, n, ts_kst()])

    def preflight(self, planned: int):
        """오늘 쓴 양 + 예정량이 한도를 넘으면 시작조차 하지 않는다."""
        used = self.quota_used_today()
        if used + planned > DAILY_QUOTA:
            raise FatalDartError(
                "일일 한도 초과 예상: 오늘 사용 %d + 예정 %d > %d. "
                "--years 나 --only 로 범위를 줄이거나 내일 재개하세요." % (used, planned, DAILY_QUOTA))
        if used + planned > DAILY_QUOTA * 0.8:
            print("  [경고] 일일 한도의 80%% 를 넘길 예정입니다 (사용 %d + 예정 %d / %d)"
                  % (used, planned, DAILY_QUOTA))

    # ── 경로 ──────────────────────────────────────────────────────────────
    def _paths(self, endpoint, params):
        kind = config.ENDPOINTS[endpoint]["kind"]
        ext = ".json" if kind == "json" else ".zip"
        slug = slug_for(endpoint, params)
        base = os.path.join(self.raw, endpoint, slug)
        return base + ext, base + ext + ".meta.json"

    def _rel(self, p):
        return os.path.relpath(p, self.out).replace(os.sep, "/")

    # ── 메인 ──────────────────────────────────────────────────────────────
    def call(self, endpoint, params=None, phase="", timeout=None, soft_transport=False) -> Result:
        assert endpoint in config.ENDPOINTS, endpoint
        params = {k: str(v) for k, v in (params or {}).items() if v not in (None, "")}
        spec = config.ENDPOINTS[endpoint]
        raw_path, meta_path = self._paths(endpoint, params)

        if self.dry_run:
            self.plan_rows.append(dict(phase=phase, endpoint=endpoint,
                                       params_json=json.dumps(params, ensure_ascii=False, sort_keys=True),
                                       raw_path=self._rel(raw_path)))
            return Result(endpoint=endpoint, params=params, kind=spec["kind"],
                          status="DRY", message="dry-run", data=None, body=b"",
                          raw_path=self._rel(raw_path), cached=False, call_id="",
                          fetched_at="", raw_sha256="", cache_age_days=None)

        cached = self._try_cache(endpoint, params, raw_path, meta_path, phase)
        if cached is not None:
            return cached

        if self.network_calls >= self.max_calls:
            raise FatalDartError("--max-calls(%d) 도달. 중단합니다." % self.max_calls)

        return self._fetch(endpoint, params, raw_path, meta_path, phase,
                           timeout or (self.doc_timeout if spec["kind"] == "zip" else self.timeout),
                           soft_transport=soft_transport)

    # ── 캐시 ──────────────────────────────────────────────────────────────
    def _try_cache(self, endpoint, params, raw_path, meta_path, phase):
        if self.refresh or not os.path.exists(raw_path):
            return None
        # 사이드카가 없으면 (중단된 실행의 잔해) 캐시 미스로 본다
        if not os.path.exists(meta_path):
            return None
        try:
            with open(meta_path, encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            return None

        status = meta.get("api_status")
        if status in self.refresh_status:
            return None
        if status not in config.CACHEABLE_STATUS:
            return None  # 애초에 캐시되면 안 되는 것 — 방어적으로 재조회

        with open(raw_path, "rb") as f:
            body = f.read()
        digest = hashlib.sha256(body).hexdigest()
        if digest != meta.get("sha256"):
            # 삭제하지 않는다. 격리하고 다시 받는다.
            qdir = os.path.join(self.raw, "_quarantine", endpoint)
            os.makedirs(qdir, exist_ok=True)
            base = os.path.basename(raw_path)
            os.replace(raw_path, os.path.join(qdir, base + ".corrupt"))
            if os.path.exists(meta_path):
                os.replace(meta_path, os.path.join(qdir, base + ".meta.json"))
            print("  [격리] sha256 불일치 → %s/%s (재조회)" % (endpoint, base))
            return None

        age = None
        try:
            age = (now_kst() - datetime.fromisoformat(meta["fetched_at"])).days
        except Exception:
            pass
        if self.max_age_days is not None and age is not None and age > self.max_age_days:
            return None

        data = self._parse(endpoint, body) if config.ENDPOINTS[endpoint]["kind"] == "json" else None
        res = Result(endpoint=endpoint, params=params, kind=config.ENDPOINTS[endpoint]["kind"],
                     status=status, message=meta.get("api_message", ""),
                     http_status=meta.get("http_status"), body=body, data=data,
                     raw_path=self._rel(raw_path), raw_sha256=digest,
                     fetched_at=meta.get("fetched_at"), cached=True,
                     call_id=meta.get("call_id", ""), cache_age_days=age,
                     anomaly=meta.get("anomaly", ""))
        self._log_call(dict(run_id=self.run_id, script_sha=self.script_sha,
                            call_id=res.call_id, fetched_at=res.fetched_at,
                            server_date=meta.get("server_date", ""), phase=phase,
                            endpoint=endpoint, url_redacted=meta.get("url_redacted", ""),
                            params_json=json.dumps(params, ensure_ascii=False, sort_keys=True),
                            http_status=res.http_status, api_status=status,
                            api_message=res.message, n_rows=len(res.rows()),
                            elapsed_ms=0, bytes=len(body), raw_path=res.raw_path,
                            raw_sha256=digest, cached="Y", attempts=0,
                            anomaly=res.anomaly or ""))
        return res

    # ── 실제 조회 ─────────────────────────────────────────────────────────
    def _fetch(self, endpoint, params, raw_path, meta_path, phase, timeout, soft_transport=False):
        spec = config.ENDPOINTS[endpoint]
        url = "%s/%s?%s" % (BASE := config.BASE_URL, spec["path"],
                            urllib.parse.urlencode(dict(params, crtfc_key=self.key)))
        url_red = self.scrub(url)
        self._seq += 1
        call_id = "%s_%04d" % (self.run_id, self._seq)

        body = headers = None
        http_status = None
        attempts = 0
        last_err = None
        for attempt in range(1, 5):
            attempts = attempt
            self._throttle()
            t0 = time.time()
            try:
                self.network_calls += 1
                self._ledger_add(1)
                http_status, body, headers = self.transport(url, timeout)
                elapsed = int((time.time() - t0) * 1000)
                clen = headers.get("Content-Length") if headers else None
                if clen and int(clen) != len(body):
                    raise urllib.error.URLError(
                        "Content-Length %s != 수신 %d (전송 중단)" % (clen, len(body)))
                break
            except urllib.error.HTTPError as e:
                # HTTPError.url 에 키가 들어 있다. 절대 그대로 새어나가지 않게 한다.
                last_err = self.scrub("HTTP %s %s" % (e.code, e.reason))
                if e.code and 400 <= e.code < 500 and e.code != 429:
                    raise FatalDartError("HTTP %s (재시도 불가): %s" % (e.code, last_err),
                                         endpoint=endpoint)
            except FixtureMissing as e:
                raise FatalDartError("픽스처 누락: %s" % e, endpoint=endpoint)
            except Exception as e:
                last_err = self.scrub("%s: %s" % (type(e).__name__, e))
            if attempt < 4:
                time.sleep(2 ** attempt + random.random())
        else:
            raise FatalDartError("전송 실패 4회 (%s): %s" % (endpoint, last_err), endpoint=endpoint)

        elapsed = int((time.time() - t0) * 1000)
        server_date = (headers or {}).get("Date", "")
        fetched_at = ts_kst()

        status, message, data, anomaly = self._interpret(endpoint, body)

        if status in config.FATAL_STATUS or anomaly == "transport_anomaly":
            # 캐시 경로를 비워 둔 채 감사용으로만 남긴다 → 다음 실행이 반드시 재조회한다
            tdir = os.path.join(self.raw, "_transient", endpoint)
            os.makedirs(tdir, exist_ok=True)
            tpath = os.path.join(tdir, "%s.%s.%s" % (os.path.basename(raw_path), call_id,
                                                     "json" if spec["kind"] == "json" else "bin"))
            with open(tpath, "wb") as f:
                f.write(body)
            self._log_call(dict(run_id=self.run_id, script_sha=self.script_sha, call_id=call_id,
                                fetched_at=fetched_at, server_date=server_date, phase=phase,
                                endpoint=endpoint, url_redacted=url_red,
                                params_json=json.dumps(params, ensure_ascii=False, sort_keys=True),
                                http_status=http_status, api_status=status, api_message=message,
                                n_rows=0, elapsed_ms=elapsed, bytes=len(body),
                                raw_path=self._rel(tpath), raw_sha256=hashlib.sha256(body).hexdigest(),
                                cached="N", attempts=attempts, anomaly=anomaly))
            if soft_transport and status not in config.FATAL_STATUS:
                # 문서 한 건의 이상은 개별 기록만 하고 넘어간다. 한도·키 문제는 여전히 치명.
                return Result(endpoint=endpoint, params=params, kind=spec["kind"],
                              status=status, message=message, http_status=http_status,
                              body=body, data=data, raw_path=self._rel(tpath),
                              raw_sha256=hashlib.sha256(body).hexdigest(),
                              fetched_at=fetched_at, cached=False, call_id=call_id,
                              cache_age_days=0, anomaly=anomaly)
            self._write_abort_note(endpoint, status, message, anomaly)
            raise FatalDartError("치명 상태 %s (%s) — 실행을 중단합니다: %s"
                                 % (status, endpoint, message), status=status, endpoint=endpoint)

        digest = self._save(raw_path, meta_path, body, dict(
            call_id=call_id, run_id=self.run_id, fetched_at=fetched_at, server_date=server_date,
            endpoint=endpoint, params=params, url_redacted=url_red, http_status=http_status,
            api_status=status, api_message=message, bytes=len(body), anomaly=anomaly, phase=phase))

        res = Result(endpoint=endpoint, params=params, kind=spec["kind"], status=status,
                     message=message, http_status=http_status, body=body, data=data,
                     raw_path=self._rel(raw_path), raw_sha256=digest, fetched_at=fetched_at,
                     cached=False, call_id=call_id, cache_age_days=0, anomaly=anomaly)
        self._log_call(dict(run_id=self.run_id, script_sha=self.script_sha, call_id=call_id,
                            fetched_at=fetched_at, server_date=server_date, phase=phase,
                            endpoint=endpoint, url_redacted=url_red,
                            params_json=json.dumps(params, ensure_ascii=False, sort_keys=True),
                            http_status=http_status, api_status=status, api_message=message,
                            n_rows=len(res.rows()), elapsed_ms=elapsed, bytes=len(body),
                            raw_path=res.raw_path, raw_sha256=digest, cached="N",
                            attempts=attempts, anomaly=anomaly))
        return res

    def _throttle(self):
        gap = time.monotonic() - self._last_call
        wait = self.delay - gap
        if wait > 0:
            time.sleep(wait + random.uniform(0, 0.08))
        self._last_call = time.monotonic()

    def _parse(self, endpoint, body):
        if config.ENDPOINTS[endpoint]["kind"] != "json":
            return None
        try:
            return json.loads(body.decode("utf-8-sig"))
        except Exception:
            return None

    def _interpret(self, endpoint, body):
        """본문에서 (status, message, data, anomaly) 를 뽑는다. HTTP status 는 믿지 않는다."""
        kind = config.ENDPOINTS[endpoint]["kind"]
        if kind == "json":
            head = body.lstrip()[:1]
            if head in (b"<",):
                # .json 인데 XML/HTML — WAF 페이지이거나 점검 안내
                return ("TRANSPORT", self.scrub(body[:200].decode("utf-8", "replace")),
                        None, "transport_anomaly")
            data = self._parse(endpoint, body)
            if data is None:
                return ("TRANSPORT", "JSON 파싱 실패(잘린 응답 가능)", None, "transport_anomaly")
            status = str(data.get("status", ""))
            message = str(data.get("message", config.STATUS_MESSAGES.get(status, "")))
            anomaly = ""
            if status == "000" and "list" not in data:
                anomaly = "empty_list_on_000"
            return (status, message, data, anomaly)

        # ZIP 계열 — 성공이면 ZIP, 실패면 XML 본문이 200 으로 온다
        if body[:4] == b"PK\x03\x04":
            return ("000", "정상", None, "")
        try:
            import xml.etree.ElementTree as ET
            root = ET.fromstring(body.decode("utf-8", "replace"))
            st = root.findtext("status") or root.findtext(".//status") or ""
            msg = root.findtext("message") or root.findtext(".//message") or ""
            if st:
                return (str(st), str(msg), None, "")
        except Exception:
            pass
        return ("TRANSPORT", "ZIP 도 XML 도 아닌 응답", None, "transport_anomaly")

    def _save(self, raw_path, meta_path, body, meta):
        """원자적 쓰기. 사이드카를 마지막에 써서 '본문만 있고 메타 없음'이 캐시 미스가 되게 한다."""
        os.makedirs(os.path.dirname(raw_path), exist_ok=True)
        digest = hashlib.sha256(body).hexdigest()
        tmp = raw_path + ".part"
        with open(tmp, "wb") as f:
            f.write(body)
        os.replace(tmp, raw_path)
        meta = dict(meta, sha256=digest, raw_file=os.path.basename(raw_path))
        tmp = meta_path + ".part"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(self.scrub(json.dumps(meta, ensure_ascii=False, indent=1)))
        os.replace(tmp, meta_path)
        return digest

    def _write_abort_note(self, endpoint, status, message, anomaly):
        with open(os.path.join(self.out, "RUN_ABORTED.txt"), "w", encoding="utf-8") as f:
            f.write(
                "실행 중단\n시각: %s\nrun_id: %s\n엔드포인트: %s\nstatus: %s (%s)\nanomaly: %s\n\n"
                "이 상태는 캐시되지 않았습니다. 원인 해소 후 같은 명령을 다시 실행하면\n"
                "이미 받은 것은 캐시에서 읽고 실패 지점부터 이어서 받습니다.\n"
                % (ts_kst(), self.run_id, endpoint, status,
                   config.STATUS_MESSAGES.get(status, ""), anomaly or "-"))

    def write_plan(self):
        import csv
        if not self.plan_rows:
            return None
        p = os.path.join(self.out, "plan.csv")
        with open(p, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["phase", "endpoint", "params_json", "raw_path"])
            w.writeheader()
            w.writerows(self.plan_rows)
        return p
