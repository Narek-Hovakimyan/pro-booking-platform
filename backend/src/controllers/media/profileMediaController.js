import path from "node:path";
import { pipeline } from "node:stream/promises";

import BarberProfile from "../../models/BarberProfile.js";
import MediaObject, { MEDIA_OBJECT_STATES } from "../../models/MediaObject.js";
import User from "../../models/User.js";
import { openProfileMedia, PROFILE_MEDIA_CLASSES } from "../../services/media/profileMediaService.js";

const safeFilename = (value) =>
  typeof value === "string" && value === path.basename(value) && /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(value);

const legacyIsBound = async (legacyUrl, kind) => {
  if (kind === "avatars") {
    const [user, profile] = await Promise.all([
      User.exists({ avatarUrl: legacyUrl }),
      BarberProfile.exists({ imageUrl: legacyUrl }),
    ]);
    return Boolean(user || profile);
  }
  return Boolean(await BarberProfile.exists({ "certifications.imageUrl": legacyUrl }));
};

const legacyFile = (kind, filename) => path.resolve(process.cwd(), "uploads", kind, filename);

const managedMediaIsBound = async (media, kind) => {
  const mediaClass = kind === "certifications"
    ? PROFILE_MEDIA_CLASSES.CERTIFICATION
    : PROFILE_MEDIA_CLASSES.AVATAR;
  if (media?.ownerModel !== "User" || media.mediaClass !== mediaClass || !media.ownerId) {
    return false;
  }
  if (kind === "certifications") {
    return Boolean(await BarberProfile.exists({
      barberId: media.ownerId,
      "certifications.imageUrl": media.legacyUrl,
    }));
  }
  const [user, profile] = await Promise.all([
    User.exists({ _id: media.ownerId, avatarUrl: media.legacyUrl }),
    BarberProfile.exists({ barberId: media.ownerId, imageUrl: media.legacyUrl }),
  ]);
  return Boolean(user || profile);
};

const inactiveManagedMediaExists = (legacyUrl) =>
  MediaObject.exists({
    legacyUrl,
    status: { $in: [MEDIA_OBJECT_STATES.DELETE_PENDING, MEDIA_OBJECT_STATES.DELETED] },
    mediaClass: { $in: Object.values(PROFILE_MEDIA_CLASSES) },
  });

export const serveProfileMedia = async (req, res) => {
  const { kind, filename } = req.params;
  if (!(["avatars", "certifications"].includes(kind) && safeFilename(filename))) {
    return res.status(404).json({ message: "Profile media not found" });
  }
  const legacyUrl = `/uploads/${kind}/${filename}`;
  try {
    const managed = await openProfileMedia({ legacyUrl });
    if (managed) {
      if (!(await managedMediaIsBound(managed.media, kind))) {
        return res.status(404).json({ message: "Profile media not found" });
      }
      res.setHeader("Cache-Control", "no-store");
      if (managed.media.contentType) res.type(managed.media.contentType);
      await pipeline(managed.stream, res);
      return res;
    }
    if (await inactiveManagedMediaExists(legacyUrl)) {
      return res.status(404).json({ message: "Profile media not found" });
    }
    if (!(await legacyIsBound(legacyUrl, kind))) {
      return res.status(404).json({ message: "Profile media not found" });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.sendFile(legacyFile(kind, filename), (error) => {
      if (error && !res.headersSent) res.status(404).json({ message: "Profile media not found" });
    });
  } catch {
    return res.status(404).json({ message: "Profile media not found" });
  }
};
