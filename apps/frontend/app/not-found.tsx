import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-6xl font-semibold text-muted-foreground">404</p>
      <p className="text-muted-foreground">This page does not exist.</p>
      <Link href="/">
        <Button variant="outline">Back to overview</Button>
      </Link>
    </div>
  );
}
