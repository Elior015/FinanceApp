import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { requestSync } from "./actions";
import { RefreshCw, Wifi, WifiOff, AlertCircle, CheckCircle2, Clock, History } from "lucide-react";
import { cn } from "@/lib/utils";

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

function ConnectionStatusIcon({ status }: { status: ConnectionRow["status"] }) {
  if (status === "active") return <Wifi className="size-4 text-success" />;
  if (status === "needs_attention") return <AlertCircle className="size-4 text-destructive" />;
  return <WifiOff className="size-4 text-muted-foreground" />;
}

function SyncStatusIcon({ status }: { status: SyncRunRow["status"] }) {
  if (status === "success") return <CheckCircle2 className="size-4 text-success" />;
  if (status === "failed") return <AlertCircle className="size-4 text-destructive" />;
  if (status === "running") return <Clock className="size-4 text-primary animate-pulse" />;
  return <History className="size-4 text-muted-foreground" />;
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
    <div className="flex flex-col gap-6">
      <PageHeader title="Sync Health" description="Bank connection status and recent sync history">
        <form action={requestSync.bind(null, null)}>
          <Button type="submit" size="sm" className="gap-2 gradient-primary">
            <RefreshCw className="size-4" />
            Sync all
          </Button>
        </form>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {((connections ?? []) as ConnectionRow[]).map((c) => (
          <Card key={c.id} className="card-shadow">
            <CardHeader className="flex flex-row items-start justify-between pb-3">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-xl",
                    c.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
                  )}
                >
                  <ConnectionStatusIcon status={c.status} />
                </div>
                <div>
                  <CardTitle>{c.display_name}</CardTitle>
                  <CardDescription className="capitalize">{c.provider}</CardDescription>
                </div>
              </div>
              <Badge variant={statusVariant(c.status)} className="capitalize">
                {c.status.replace("_", " ")}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {c.last_success_at ? `Last synced ${new Date(c.last_success_at).toLocaleString("en-IL")}` : "Never synced"}
                </span>
              </div>
              <form action={requestSync.bind(null, c.id)}>
                <Button type="submit" size="sm" variant="outline" className="w-full gap-2">
                  <RefreshCw className="size-4" />
                  Sync now
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="card-shadow overflow-hidden">
        <CardHeader>
          <CardTitle>Recent sync runs</CardTitle>
          <CardDescription>History of bank sync attempts and results</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
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
                  <TableCell className="font-medium">{run.connections?.display_name ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(run.started_at).toLocaleString("en-IL")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(run.status)} className="gap-1 capitalize">
                      <SyncStatusIcon status={run.status} />
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{run.error_code ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium">{run.txns_new}</TableCell>
                  <TableCell className="text-right font-medium">{run.pending_resolved}</TableCell>
                </TableRow>
              ))}
              {(syncRuns ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No sync runs yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
