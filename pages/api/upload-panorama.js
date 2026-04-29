import fs from "node:fs";
import path from "node:path";
import { IncomingForm } from "formidable";

export const config = {
  api: {
    bodyParser: false,
  },
};

const uploadsDir = path.join(process.cwd(), "public", "uploads");

const ensureUploadsDir = () => {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
};

const parseForm = async (req) =>
  new Promise((resolve, reject) => {
    const form = new IncomingForm({
      multiples: false,
      keepExtensions: true,
      maxFileSize: 15 * 1024 * 1024,
    });
    form.parse(req, (error, fields, files) => {
      if (error) return reject(error);
      resolve({ fields, files });
    });
  });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    ensureUploadsDir();

    const { files } = await parseForm(req);
    const fileEntry = files.image;
    const file = Array.isArray(fileEntry) ? fileEntry[0] : fileEntry;

    if (!file) {
      return res.status(400).json({ error: "No image field uploaded" });
    }

    const extension = path.extname(file.originalFilename || ".jpg") || ".jpg";
    const safeExt = extension.toLowerCase();
    const fileName = `panorama-${Date.now()}${safeExt}`;
    const destination = path.join(uploadsDir, fileName);

    fs.copyFileSync(file.filepath, destination);

    return res.status(200).json({
      url: `/uploads/${fileName}`,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to upload panorama image",
      details: error instanceof Error ? error.message : "Unknown upload error",
    });
  }
}
