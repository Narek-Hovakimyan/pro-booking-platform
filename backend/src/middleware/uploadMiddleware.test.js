import fs from "fs";
import path from "path";
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import {
  deleteUploadedFile,
  uploadAvatar,
  uploadCertificateFile,
  uploadCertificationImage,
  uploadEventImage,
  uploadPortfolioImages,
  uploadReferenceImages,
} from "./uploadMiddleware.js";

const uploadsDir = path.resolve(process.cwd(), "uploads");

describe("deleteUploadedFile", () => {
  const testFiles = [];

  after(() => {
    for (const file of testFiles) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  const createTempFile = (relativePath) => {
    const absolutePath = path.resolve(uploadsDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, "test content", "utf8");
    testFiles.push(absolutePath);
    return absolutePath;
  };

  it("deletes a file inside uploads using relative path", () => {
    const file = createTempFile("test-delete.txt");
    assert.ok(fs.existsSync(file));

    deleteUploadedFile("uploads/test-delete.txt");

    assert.equal(fs.existsSync(file), false);
  });

  it("deletes a file inside uploads using leading-slash path", () => {
    const file = createTempFile("test-delete-leading.txt");
    assert.ok(fs.existsSync(file));

    deleteUploadedFile("/uploads/test-delete-leading.txt");

    assert.equal(fs.existsSync(file), false);
  });

  it("rejects traversal path and does not delete outside uploads", () => {
    const outsideFile = path.resolve(process.cwd(), "should-not-be-deleted.txt");
    try {
      fs.writeFileSync(outsideFile, "sensitive", "utf8");
      assert.ok(fs.existsSync(outsideFile));

      deleteUploadedFile("/../../should-not-be-deleted.txt");

      assert.ok(fs.existsSync(outsideFile), "outside file should still exist");
    } finally {
      try { fs.unlinkSync(outsideFile); } catch {}
    }
  });

  it("rejects traversal via ../uploads/../server.js", () => {
    const outsideFile = path.resolve(process.cwd(), "server.js");
    const originalContent = fs.existsSync(outsideFile)
      ? fs.readFileSync(outsideFile, "utf8")
      : null;

    deleteUploadedFile("../uploads/../server.js");

    // file should not have been deleted
    if (originalContent !== null) {
      assert.equal(fs.readFileSync(outsideFile, "utf8"), originalContent);
    }
  });

  it("rejects uploads/../../package.json traversal", () => {
    const pkgPath = fs.existsSync(path.resolve(process.cwd(), "package.json"))
      ? path.resolve(process.cwd(), "package.json")
      : path.resolve(process.cwd(), "backend", "package.json");
    const originalContent = fs.readFileSync(pkgPath, "utf8");

    deleteUploadedFile("uploads/../../package.json");

    assert.equal(fs.readFileSync(pkgPath, "utf8"), originalContent);
  });

  it("does nothing for empty path", () => {
    // Should not throw
    deleteUploadedFile("");
    deleteUploadedFile(null);
    deleteUploadedFile(undefined);
  });
});

describe("upload filename compatibility", () => {
  const getFilename = (upload, originalname) =>
    new Promise((resolve, reject) => {
      upload.storage.getFilename({}, { originalname }, (error, filename) => {
        if (error) reject(error);
        else resolve(filename);
      });
    });

  it("keeps legacy prefixes and extensions with UUID names", async () => {
    const cases = [
      [uploadAvatar, "avatar.JPG", /^[0-9a-f-]{36}\.jpg$/],
      [uploadCertificationImage, "cert.PNG", /^cert-[0-9a-f-]{36}\.png$/],
      [uploadEventImage, "event.WEBP", /^event-[0-9a-f-]{36}\.webp$/],
      [uploadCertificateFile, "certificate.PDF", /^certfile-[0-9a-f-]{36}\.pdf$/],
      [uploadPortfolioImages, "portfolio.JPEG", /^portfolio-[0-9a-f-]{36}\.jpeg$/],
      [uploadReferenceImages, "reference.PNG", /^ref-[0-9a-f-]{36}\.png$/],
    ];

    for (const [upload, originalname, pattern] of cases) {
      assert.match(await getFilename(upload, originalname), pattern);
    }
  });

  it("does not collide across repeated generated names", async () => {
    const names = await Promise.all(
      Array.from({ length: 200 }, () => getFilename(uploadCertificationImage, "cert.jpg"))
    );

    assert.equal(new Set(names).size, names.length);
  });
});
