// Deprecated — use POST /api/documents/[docId]/flags instead
import type { NextApiRequest, NextApiResponse } from "next";
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(410).json({ error: "Gone. Use POST /api/documents/[docId]/flags" });
}
