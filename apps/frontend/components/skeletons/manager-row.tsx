import { Table, TableRow, TableCell, TableHead, TableHeader, TableBody } from "@/components/ui/table";

export function ManagerTableSkeleton() {
  return (
    <div className="w-full overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">#</TableHead>
            <TableHead>Manager</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>TVL</TableHead>
            <TableHead>APY</TableHead>
            <TableHead>Sharpe</TableHead>
            <TableHead>Max DD</TableHead>
            <TableHead>Years</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell><div className="h-4 w-6 animate-pulse rounded bg-muted/40" /></TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="h-4 w-32 animate-pulse rounded bg-muted/40" />
                  <div className="h-3 w-48 animate-pulse rounded bg-muted/40" />
                </div>
              </TableCell>
              <TableCell><div className="h-6 w-12 animate-pulse rounded bg-muted/40" /></TableCell>
              <TableCell><div className="h-4 w-20 animate-pulse rounded bg-muted/40" /></TableCell>
              <TableCell><div className="h-4 w-12 animate-pulse rounded bg-muted/40" /></TableCell>
              <TableCell><div className="h-4 w-10 animate-pulse rounded bg-muted/40" /></TableCell>
              <TableCell><div className="h-4 w-10 animate-pulse rounded bg-muted/40" /></TableCell>
              <TableCell><div className="h-4 w-8 animate-pulse rounded bg-muted/40" /></TableCell>
              <TableCell><div className="h-6 w-16 animate-pulse rounded bg-muted/40" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
