import { lazy, Suspense } from "react";
import { ThemeProvider } from "next-themes";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import NotFound from "@/pages/NotFound";

// Lazy-load admin routes so the landing bundle doesn't ship Recharts, the
// dashboard tables, or the meta-debug shell. Cuts the visitor JS payload
// roughly in half — landing PageView fires noticeably faster on mobile.
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const MetaDebug = lazy(() => import("@/pages/MetaDebug"));

function AdminFallback() {
  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-slate-950 text-slate-300">
      <div className="text-sm tracking-wide">Chargement…</div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <Toaster />
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/dashboard/meta-debug">
            <Suspense fallback={<AdminFallback />}>
              <MetaDebug />
            </Suspense>
          </Route>
          <Route path="/dashboard">
            <Suspense fallback={<AdminFallback />}>
              <Dashboard />
            </Suspense>
          </Route>
          <Route component={NotFound} />
        </Switch>
      </TooltipProvider>
    </ThemeProvider>
  );
}
