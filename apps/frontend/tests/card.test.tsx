import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card data-testid="card">Hello</Card>);
    expect(screen.getByTestId("card")).toHaveTextContent("Hello");
  });

  it("merges custom className", () => {
    const { container } = render(<Card className="custom-class" />);
    const card = container.querySelector("[class*='rounded-xl']");
    expect(card?.className).toContain("custom-class");
    expect(card?.className).toContain("rounded-xl");
  });

  it("renders header, title, and content", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardContent>Body</CardContent>
      </Card>,
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });
});
