import test from "node:test";
import assert from "node:assert/strict";
import {
  audioConcatFilter,
  bgmInputArgs,
  fadeFilters,
  finalArgs,
  forceStyle,
  imageClipArgs,
  kenBurnsFor,
  lavfiColor,
  mixFilter,
  solidFrameArgs,
  videoClipArgs,
  zoompanExpr,
} from "./filters";

test("zoompanExpr — D를 숫자로 치환한 on/D 스케일 식", () => {
  assert.equal(
    zoompanExpr("in", 125),
    "zoompan=z='1+0.10*on/125':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=125:s=1920x1080:fps=25",
  );
  assert.match(zoompanExpr("out", 300), /z='1\.10-0\.10\*on\/300'/);
  assert.match(zoompanExpr("right", 80), /z='1\.06':x='\(iw-iw\/zoom\)\*on\/80'/);
  assert.match(zoompanExpr("left", 80), /x='\(iw-iw\/zoom\)\*\(1-on\/80\)'/);
  for (const k of ["in", "out", "left", "right"] as const) {
    const e = zoompanExpr(k, 50);
    assert.ok(e.includes(":y='ih/2-(ih/zoom/2)'"), e);
    assert.ok(e.endsWith(":d=50:s=1920x1080:fps=25"), e);
    assert.ok(!e.includes("max(1,d-1)"), "on/D 방식이므로 d-1 식이 없어야 함");
  }
  // 프레임 수 0 이하 방어
  assert.match(zoompanExpr("in", 0), /:d=1:/);
});

test("kenBurnsFor — in → right → out → left 순환", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(kenBurnsFor), ["in", "right", "out", "left", "in", "right"]);
});

test("fadeFilters — 시작 페이드인, 끝 페이드아웃(길이 기준)", () => {
  assert.deepEqual(fadeFilters(100, false, false), []);
  assert.deepEqual(fadeFilters(100, true, false), ["fade=t=in:st=0:d=0.300"]);
  assert.deepEqual(fadeFilters(100, false, true), ["fade=t=out:st=3.700:d=0.300"]);
  // 클립이 0.3초보다 짧으면 전체 길이로 제한
  assert.deepEqual(fadeFilters(5, true, true), ["fade=t=in:st=0:d=0.200", "fade=t=out:st=0.000:d=0.200"]);
});

test("imageClipArgs — 단일 이미지 + zoompan d=F + -frames:v F (loop/-t 없음)", () => {
  const args = imageClipArgs({ image: "/abs/frames/scene-001.png", frames: 125, kenBurns: "in", fadeIn: true, out: "clips/scene-001.mp4" });
  assert.ok(!args.includes("-loop"));
  assert.ok(!args.includes("-t"));
  const vf = args[args.indexOf("-vf") + 1];
  assert.ok(vf.startsWith("scale=2304:1296,zoompan=z='1+0.10*on/125'"), vf);
  assert.ok(vf.includes("fade=t=in:st=0:d=0.300"), vf);
  assert.ok(vf.endsWith("format=yuv420p"), vf);
  assert.equal(args[args.indexOf("-frames:v") + 1], "125");
  assert.equal(args[args.indexOf("-i") + 1], "/abs/frames/scene-001.png");
  assert.equal(args[args.length - 1], "clips/scene-001.mp4");
  assert.ok(args.includes("-an"));
  assert.ok(args.includes("libx264"));
  assert.ok(args.includes("yuv420p"));
  // 페이드 없음
  const plain = imageClipArgs({ image: "a.png", frames: 50, kenBurns: "left", out: "o.mp4" });
  assert.ok(!plain[plain.indexOf("-vf") + 1].includes("fade="));
});

test("videoClipArgs — -stream_loop -1 + 오버레이 + -frames:v F", () => {
  const args = videoClipArgs({ video: "/c/stock.mp4", overlay: "/abs/frames/scene-002-overlay.png", frames: 200, fadeOut: true, out: "clips/scene-002.mp4" });
  assert.deepEqual(args.slice(1, 7), ["-stream_loop", "-1", "-i", "/c/stock.mp4", "-i", "/abs/frames/scene-002-overlay.png"]);
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.equal(
    fc,
    "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=25,setsar=1[bg];[bg][1:v]overlay=0:0:format=auto,fade=t=out:st=7.700:d=0.300,format=yuv420p[v]",
  );
  assert.equal(args[args.indexOf("-frames:v") + 1], "200");
  assert.equal(args[args.indexOf("-map") + 1], "[v]");
  // 오버레이 없음
  const bare = videoClipArgs({ video: "s.mp4", frames: 30, out: "o.mp4" });
  assert.ok(!bare.includes("[1:v]"));
  const fc2 = bare[bare.indexOf("-filter_complex") + 1];
  assert.equal(fc2, "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=25,setsar=1,format=yuv420p[v]");
});

test("audioConcatFilter — aresample 48k, atrim, asetpts, apad=whole_len=F*1920, aformat 종료", () => {
  const f = audioConcatFilter(2, [125, 50], [4500, 1234]);
  const parts = f.split(";");
  assert.equal(parts.length, 3);
  assert.equal(
    parts[0],
    "[0:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:4.500,asetpts=PTS-STARTPTS,apad=whole_len=240000[a0]",
  );
  assert.equal(
    parts[1],
    "[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:1.234,asetpts=PTS-STARTPTS,apad=whole_len=96000[a1]",
  );
  assert.equal(parts[2], "[a0][a1]concat=n=2:v=0:a=1,aformat=sample_rates=48000:channel_layouts=stereo[a]");
  assert.ok(!f.includes("pad_dur"), "apad=pad_dur는 이 ffmpeg에 없음");
  // 나레이션이 클립보다 길면 클립 길이(F/25)까지만
  assert.match(audioConcatFilter(1, [25], [9999]), /atrim=0:1\.000/);
  assert.throws(() => audioConcatFilter(0, [], []));
  assert.throws(() => audioConcatFilter(2, [10], [10]));
});

test("mixFilter — BGM 없음: loudnorm + aformat 종료", () => {
  assert.equal(
    mixFilter({ bgm: false, ducking: false, totalSec: 60 }),
    "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,aformat=sample_rates=48000:channel_layouts=stereo[a]",
  );
});

test("mixFilter — BGM 덕킹: asplit → sidechaincompress → amix → loudnorm → aformat", () => {
  const f = mixFilter({ bgm: true, ducking: true, totalSec: 60 });
  const parts = f.split(";");
  assert.equal(parts[0], "[0:a]asplit=2[n1][n2]");
  assert.equal(parts[1], "[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.18,afade=t=out:st=57.000:d=3.000[b]");
  assert.equal(parts[2], "[b][n2]sidechaincompress=threshold=0.015:ratio=8:attack=40:release=500:makeup=1[bd]");
  assert.equal(
    parts[3],
    "[n1][bd]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,aformat=sample_rates=48000:channel_layouts=stereo[a]",
  );
  assert.ok(f.endsWith("aformat=sample_rates=48000:channel_layouts=stereo[a]"));
  // 3초보다 짧은 영상: st=0, d=total
  assert.match(mixFilter({ bgm: true, ducking: true, totalSec: 2 }), /afade=t=out:st=0\.000:d=2\.000/);
});

test("mixFilter — BGM 덕킹 없음: volume=0.10 + amix", () => {
  const f = mixFilter({ bgm: true, ducking: false, totalSec: 10 });
  assert.ok(f.includes("volume=0.1,"), f);
  assert.ok(!f.includes("sidechaincompress"));
  assert.ok(f.includes("[0:a][b]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,aformat=sample_rates=48000:channel_layouts=stereo[a]"));
});

test("bgmInputArgs — -stream_loop -1 -t <total> -i", () => {
  assert.deepEqual(bgmInputArgs("/m/bgm.mp3", 72.4), ["-stream_loop", "-1", "-t", "72.400", "-i", "/m/bgm.mp3"]);
});

test("forceStyle — 검증된 1080p 자막 스타일 (FontSize=26, MarginV=20, MarginL/R=40)", () => {
  assert.equal(
    forceStyle("Noto Sans KR"),
    "FontName=Noto Sans KR,FontSize=26,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=20,MarginL=40,MarginR=40,Alignment=2",
  );
  // 쉼표·따옴표는 스타일 문자열을 깨뜨리므로 제거
  assert.match(forceStyle("Bad,Font'Name"), /^FontName=Bad Font Name,/);
  assert.match(forceStyle("   "), /^FontName=sans-serif,/);
});

test("lavfiColor — #hex → 0xhex, 잘못된 값은 teal", () => {
  assert.equal(lavfiColor("#14B8A6"), "0x14b8a6");
  assert.equal(lavfiColor("0f172a"), "0x0f172a");
  assert.equal(lavfiColor("red"), "0x14b8a6");
  assert.equal(lavfiColor(undefined), "0x14b8a6");
});

test("finalArgs — 진행 바 overlay → subtitles(상대 경로) → 오디오 정확 길이, 인코딩 옵션", () => {
  const args = finalArgs({
    video: "clips/video-only.mp4",
    audio: "audio/mixed.m4a",
    srt: "subtitles.srt",
    fontsDir: "fonts",
    family: "Noto Sans KR",
    progressBar: true,
    accent: "#14b8a6",
    totalSec: 72.4,
    totalFrames: 1810,
    out: "final.mp4",
  });
  // 입력 순서: video, audio, lavfi 바
  assert.deepEqual(args.slice(0, 5), ["-y", "-i", "clips/video-only.mp4", "-i", "audio/mixed.m4a"]);
  const lavfiIdx = args.indexOf("lavfi");
  assert.equal(args[lavfiIdx - 1], "-f");
  assert.equal(args[lavfiIdx + 2], "color=c=0x14b8a6:s=1920x6:r=25");
  const fc = args[args.indexOf("-filter_complex") + 1];
  const chains = fc.split(";");
  assert.equal(chains[0], "[0:v][2:v]overlay=x='-1920+1920*t/72.400':y=1074:shortest=1[vb]");
  assert.equal(
    chains[1],
    "[vb]subtitles=subtitles.srt:fontsdir=fonts:force_style='FontName=Noto Sans KR,FontSize=26,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=20,MarginL=40,MarginR=40,Alignment=2'[v]",
  );
  assert.equal(
    chains[2],
    "[1:a]atrim=0:72.400,asetpts=PTS-STARTPTS,apad=whole_len=3475200,aformat=sample_rates=48000:channel_layouts=stereo[a]",
  );
  assert.ok(!fc.includes("/home/"), "필터 안에 절대 경로 금지");
  assert.equal(args[args.indexOf("-frames:v") + 1], "1810");
  const idx = (k: string) => args.indexOf(k);
  assert.equal(args[idx("-c:v") + 1], "libx264");
  assert.equal(args[idx("-preset") + 1], "medium");
  assert.equal(args[idx("-crf") + 1], "20");
  assert.equal(args[idx("-pix_fmt") + 1], "yuv420p");
  assert.equal(args[idx("-c:a") + 1], "aac");
  assert.equal(args[idx("-b:a") + 1], "160k");
  assert.equal(args[idx("-movflags") + 1], "+faststart");
  assert.ok(args.includes("-shortest"));
  assert.equal(args[args.length - 1], "final.mp4");
  // -map [v] / -map [a]
  const maps = args.map((a, i) => (a === "-map" ? args[i + 1] : null)).filter(Boolean);
  assert.deepEqual(maps, ["[v]", "[a]"]);
});

test("finalArgs — 진행 바 없음: lavfi 입력·overlay 없이 [0:v]subtitles", () => {
  const args = finalArgs({
    video: "v.mp4",
    audio: "a.m4a",
    srt: "subtitles.srt",
    fontsDir: "fonts",
    family: "Noto Sans KR",
    progressBar: false,
    accent: "#14b8a6",
    totalSec: 10,
    out: "final.mp4",
  });
  assert.ok(!args.includes("lavfi"));
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.ok(fc.startsWith("[0:v]subtitles=subtitles.srt:fontsdir=fonts:force_style='"), fc);
  assert.ok(!fc.includes("overlay"));
  assert.ok(fc.includes("apad=whole_len=480000"), fc); // 10초 × 25 × 1920
  assert.ok(!args.includes("-frames:v"));
});

test("solidFrameArgs — lavfi 단색 1프레임 PNG", () => {
  const args = solidFrameArgs("#0b1220", "clips/scene-003-solid.png");
  assert.deepEqual(args, ["-y", "-f", "lavfi", "-i", "color=c=0x0b1220:s=2304x1296:r=25", "-frames:v", "1", "clips/scene-003-solid.png"]);
});
