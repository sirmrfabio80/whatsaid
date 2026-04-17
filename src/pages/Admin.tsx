import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminGuard from "@/components/admin/AdminGuard";
import TranscribeTemplatesTab from "@/components/admin/TranscribeTemplatesTab";

export default function Admin() {
  return (
    <AdminGuard>
      <main className="container mx-auto px-4 py-10 max-w-6xl">
        <header className="mb-8">
          <h1 className="text-3xl font-heading font-bold tracking-tight">
            Admin
          </h1>
          <p className="text-muted-foreground mt-1">
            Internal controls. Visible only to admins.
          </p>
        </header>

        <Tabs defaultValue="transcribe" className="space-y-6">
          <TabsList>
            <TabsTrigger value="transcribe">Transcribe settings</TabsTrigger>
          </TabsList>
          <TabsContent value="transcribe" className="space-y-6">
            <TranscribeTemplatesTab />
          </TabsContent>
        </Tabs>
      </main>
    </AdminGuard>
  );
}
