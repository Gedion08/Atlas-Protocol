import { Card, CardContent } from "@/components/ui/card";

export function ProposalCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-64 animate-pulse rounded bg-muted/40" />
          <div className="h-6 w-20 animate-pulse rounded bg-muted/40" />
        </div>
        <div className="space-y-2">
          <div className="h-2 w-full animate-pulse rounded bg-muted/40" />
          <div className="h-2 w-3/4 animate-pulse rounded bg-muted/40" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-20 animate-pulse rounded bg-muted/40" />
          <div className="h-8 w-20 animate-pulse rounded bg-muted/40" />
        </div>
      </CardContent>
    </Card>
  );
}
