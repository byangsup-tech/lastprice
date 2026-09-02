import { createReadStream, promises as fs } from "fs";
import { Readable } from "stream";
import { type NextRequest } from "next/server";
import { isValidJobId, resolveServableFile } from "@/lib/youtube/paths";
import { contentTypeFor, jsonError, parseRange } from "../../../_shared/http";

export const runtime = "nodejs";

/**
 * 산출물 스트리밍: GET ?name=<허용 목록 이름>
 * - 허용 목록·경로 탈출 검사는 resolveServableFile 하나로만 (정규식 재구현 금지)
 * - Range 단일 구간 지원 (206/416), 200에도 accept-ranges: bytes
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidJobId(id)) return jsonError("잘못된 작업 id", 400);
  const name = req.nextUrl.searchParams.get("name") ?? "";
  const file = resolveServableFile(id, name);
  if (!file) return jsonError("허용되지 않는 파일 이름", 400);

  let size: number;
  try {
    const st = await fs.stat(file);
    if (!st.isFile()) return jsonError("파일 없음", 404);
    size = st.size;
  } catch {
    return jsonError("파일 없음", 404);
  }

  const type = contentTypeFor(name);
  const isMedia = /^(video|image|audio)\//.test(type);
  const baseHeaders: Record<string, string> = {
    "content-type": type,
    "accept-ranges": "bytes",
    // 산출물은 재생성될 수 있으므로 브라우저 캐시는 짧게 (미디어는 재검증)
    "cache-control": isMedia ? "private, max-age=0, must-revalidate" : "no-store",
  };

  const range = parseRange(req.headers.get("range"), size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, "content-range": `bytes */${size}` },
    });
  }
  const start = range ? range.start : 0;
  const end = range ? range.end : size - 1;
  const length = size === 0 ? 0 : end - start + 1;

  if (size === 0) {
    return new Response(null, { status: 200, headers: { ...baseHeaders, "content-length": "0" } });
  }

  const stream = createReadStream(file, { start, end });
  const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
  const headers: Record<string, string> = { ...baseHeaders, "content-length": String(length) };
  if (range) headers["content-range"] = `bytes ${start}-${end}/${size}`;
  return new Response(body, { status: range ? 206 : 200, headers });
}
