import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminGuard from "@/components/admin/AdminGuard";
import TranscribeTemplatesTab from "@/components/admin/TranscribeTemplatesTab";
import LogsTab from "@/components/admin/LogsTab";
import WatchdogTab from "@/components/admin/WatchdogTab";
import FaqFeedbackTab from "@/components/admin/FaqFeedbackTab";
import OthersTab from "@/components/admin/OthersTab";

export default function Admin() {
  return (
    <AdminGuard>
      <main className="container mx-auto px-4 py-10 max-w-6xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Admin
          </h1>
          <p className="text-muted-foreground mt-1">
            Internal controls. Visible only to admins.
          </p>
        </header>

        <Tabs defaultValue="transcribe" className="space-y-6">
          <TabsList>
            <TabsTrigger value="transcribe">Transcribe settings</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="watchdog">Watchdog</TabsTrigger>
            <TabsTrigger value="faq-feedback">FAQ feedback</TabsTrigger>
            <TabsTrigger value="others">Others</TabsTrigger>
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
          <TabsContent value="others" className="space-y-6">
            <OthersTab />
          </TabsContent>
        </Tabs>
      </main>
    </AdminGuard>
  );
}
