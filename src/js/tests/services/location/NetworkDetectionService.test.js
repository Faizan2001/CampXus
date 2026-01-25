import { NetworkDetectionService } from "../../../services/location/NetworkDetectionService.js";

describe("NetworkDetectionService", () => {
  test("checkAsDomainMatch compares case-insensitively", () => {
    const svc = new NetworkDetectionService();
    expect(svc.checkAsDomainMatch("Example.EDU", "example.edu")).toBe(true);
    expect(svc.checkAsDomainMatch("example.edu", "other.edu")).toBe(false);
  });

  test("checkOrganizationMatch matches direct, alternative, and reverse", () => {
    const svc = new NetworkDetectionService();

    expect(
      svc.checkOrganizationMatch(
        "Indiana University Bloomington",
        "Indiana University",
        []
      )
    ).toBe(true);

    expect(
      svc.checkOrganizationMatch(
        "IUB Campus Network",
        "Indiana University",
        ["IUB", "iu.edu"]
      )
    ).toBe(true);

    // Reverse match (expected contains user)
    expect(svc.checkOrganizationMatch("iu", "iu.edu", [])).toBe(true);
  });

  test("isValidIP validates IPv4 format", () => {
    const svc = new NetworkDetectionService();
    expect(svc.isValidIP("1.2.3.4")).toBe(true);
    expect(svc.isValidIP("256.1.2.3")).toBe(false);
    expect(svc.isValidIP("1.2.3")).toBe(false);
    expect(svc.isValidIP("abc")).toBe(false);
  });
});

