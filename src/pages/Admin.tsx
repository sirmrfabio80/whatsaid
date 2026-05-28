import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminGuard from "@/components/admin/AdminGuard";
import TranscribeTemplatesTab from "@/components/admin/TranscribeTemplatesTab";
import LogsTab from "@/components/admin/LogsTab";
import WatchdogTab from "@/components/admin/WatchdogTab";
import FaqFeedbackTab from "@/components/admin/FaqFeedbackTab";
import OthersTab from "@/components/admin/OthersTab";
import DiagnosticsTab from "@/components/admin/DiagnosticsTab";
import UsageTab from "@/components/admin/UsageTab";
import RetentionTab from "@/components/admin/RetentionTab";
import RetentionMonitorTab from "@/components/admin/RetentionMonitorTab";
import DsrTab from "@/components/admin/DsrTab";
import SecurityHeadersTab from "@/components/admin/SecurityHeadersTab";
import EdgeHealthTab from "@/components/admin/EdgeHealthTab";
import { usePageMeta } from "@/hooks/use-page-meta";

export default function Admin() {
  usePageMeta({ title: "Admin — WhatSaid", noindex: true, robots: "noindex,nofollow" });
  return (
    <AdminGuard>
      <main className="container mx-auto px-4 py-10 max-w-6xl">
        <header className="mb-8">
          <h1 className="text-h1 tracking-tight">
            Admin
          </h1>
          <p className="text-body-sm text-muted-foreground mt-1">
            Internal controls. Visible only to admins.
          </p>
        </header>

        <Tabs defaultValue="transcribe" className="space-y-6">
          <TabsList>
            <TabsTrigger value="transcribe">Transcribe settings</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="watchdog">Watchdog</TabsTrigger>
            <TabsTrigger value="faq-feedback">FAQ feedback</TabsTrigger>
            <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="retention">Retention</TabsTrigger>
            <TabsTrigger value="retention-monitor">Retention monitor</TabsTrigger>
            <TabsTrigger value="dsrs">DSRs</TabsTrigger>
            <TabsTrigger value="security-headers">Security headers</TabsTrigger>
            <TabsTrigger value="edge-health">Edge health</TabsTrigger>
            <TabsTrigger value="others">Others</TabsTrigger>
          </TabsList>
          </TabsList>
          <TabsContent value="transcribe" className="space-y-6">
            <TranscribeTemplatesTab />
          </TabsContent>
          <TabsContent value="logs" className="space-y-6">
            <LogsTab />
          </TabsContent>
          <TabsContent value="watchdog" className="space-y-6">
            <WatchdogTab />
          </TabsContent>
          <TabsContent value="faq-feedback" className="space-y-6">
            <FaqFeedbackTab />
          </TabsContent>
          <TabsContent value="diagnostics" className="space-y-6">
            <DiagnosticsTab />
          </TabsContent>
          <TabsContent value="usage" className="space-y-6">
            <UsageTab />
          </TabsContent>
          <TabsContent value="retention" className="space-y-6">
            <RetentionTab />
          </TabsContent>
          <TabsContent value="retention-monitor" className="space-y-6">
            <RetentionMonitorTab />
          </TabsContent>
          <TabsContent value="dsrs" className="space-y-6">
            <DsrTab />
          </TabsContent>
          <TabsContent value="security-headers" className="space-y-6">
            <SecurityHeadersTab />
          </TabsContent>
          <TabsContent value="others" className="space-y-6">
            <OthersTab />
          </TabsContent>
        </Tabs>
      </main>
    </AdminGuard>
  );
}
