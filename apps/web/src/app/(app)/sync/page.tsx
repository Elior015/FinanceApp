import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requestSync } from "./actions";

interface ConnectionRow {
  id: string;
  provider: string;
  display_name: string;
  status: "active" | "needs_attention" | "disabled";
  last_success_at: string | null;
}

interface SyncRunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "partial" | "failed";
  error_code: string | null;
  txns_new: number;
  pending_resolved: number;
  connections: { display_name: string } | null;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active" || status === "success" || status === "done") return "default";
  if (status === "needs_attention" || status === "failed") return "destructive";
  if (status === "running" || status === "claimed" || status === "pending") return "secondary";
  return "outline";
}

export default async function SyncHealthPage() {
  const supabase = await createClient();

  const [{ data: connections }, { data: syncRuns }] = await Promise.all([
    supabase.from("connections").select("id, provider, display_name, status, last_success_at").order("display_name"),
    supabase
      .from("sync_runs")
      .select("id, started_at, finished_at, status, error_code, txns_new, pending_resolved, connections(display_name)")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sync Health</h1>
        <form action={requestSync.bind(null, null)}>
          <Button type="submit" size="sm">
            Sync all
          </Button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {((connections ?? []) as ConnectionRow[]).map((c) => (
          <Card key={c.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                {c.display_name} <span className="text-xs font-normal text-muted-foreground">({c.provider})</span>
              </CardTitle>
              <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
            </CardHeader>
            <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{c.last_success_at ? `Last synced ${new Date(c.last_success_at).toLocaleString("en-IL")}` : "Never synced"}</span>
              <form action={requestSync.bind(null, c.id)}>
                <Button type="submit" size="sm" variant="outline">
                  Sync now
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent sync runs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Connection</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead className="text-right">Pending resolved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((syncRuns ?? []) as unknown as SyncRunRow[]).map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{run.connections?.display_name ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{new Date(run.started_at).toLocaleString("en-IL")}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{run.error_code ?? "—"}</TableCell>
                  <TableCell className="text-right">{run.txns_new}</TableCell>
                  <TableCell className="text-right">{run.pending_resolved}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
