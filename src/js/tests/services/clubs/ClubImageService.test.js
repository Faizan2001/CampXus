import { deleteEventImage, uploadEventImage } from "../../../services/clubs/ClubImageService.js";

describe("ClubImageService", () => {
  test("uploadEventImage() throws when not authenticated", async () => {
    await expect(uploadEventImage("c1", "e1", new Blob())).rejects.toThrow(
      "Must be authenticated"
    );
  });

  test("deleteEventImage() is a no-op when not authenticated", async () => {
    await expect(deleteEventImage("c1", "e1")).resolves.toBeUndefined();
  });
});

