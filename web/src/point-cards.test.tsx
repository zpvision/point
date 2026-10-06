import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PointCard, PointsStats, type PointItem } from "./point-cards";

const draft: PointItem = {
  id: "draft",
  session_id: "draft",
  application_id: "",
  name: "Ваша новая точка",
  formatted_address: "",
  city: "",
  status: "DRAFT",
  point_status: "PENDING",
  created_at: "2026-10-06T10:00:00Z",
  updated_at: "2026-10-06T10:00:00Z",
  organization_name: "",
  cover_id: "",
};

describe("Point dashboard", () => {
  it("opens a saved draft and shows the storefront placeholder", () => {
    const html = renderToStaticMarkup(<PointCard point={draft} />);
    expect(html).toContain('href="/points/new?session=draft"');
    expect(html).toContain('class="storefront-icon"');
    expect(html).toContain("Черновик");
    expect(html).toContain("Продолжить");
  });
  it("shows the actual cover and links to the submitted application", () => {
    const html = renderToStaticMarkup(
      <PointCard
        point={{
          ...draft,
          application_id: "application",
          status: "IN_REVIEW",
          cover_id: "photo",
          organization_name: "Ромашка",
        }}
      />,
    );
    expect(html).toContain('src="/api/attachments/photo"');
    expect(html).not.toContain('class="storefront-icon"');
    expect(html).toContain('href="/applications/application"');
    expect(html).toContain("Ромашка");
  });
  it("counts drafts, applications in review and active Points independently", () => {
    const html = renderToStaticMarkup(
      <PointsStats
        items={[
          draft,
          { ...draft, id: "review", status: "IN_REVIEW" },
          {
            ...draft,
            id: "active",
            status: "APPROVED",
            point_status: "ACTIVE",
          },
        ]}
      />,
    );
    expect(html).toContain("Всего точек</dt><dd>03");
    expect(html).toContain("Черновики</dt><dd>01");
    expect(html).toContain("На проверке</dt><dd>01");
    expect(html).toContain("Активные</dt><dd>01");
  });
});
