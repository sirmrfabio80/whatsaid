import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface AvatarUploadProps {
  userId: string;
  avatarUrl: string | null;
  initials: string;
  size?: "sm" | "lg";
  editable?: boolean;
  onUploaded?: (url: string) => void;
}

export default function AvatarUpload({
  userId,
  avatarUrl,
  initials,
  size = "lg",
  editable = true,
  onUploaded,
}: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const sizeClasses = size === "lg" ? "w-14 h-14 text-xl" : "w-7 h-7 text-xs";

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error(t("profile.avatarInvalidType", "Please upload an image file"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("profile.avatarTooLarge", "Image must be under 2MB"));
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/avatar.${ext}`;

      // Delete old avatar files first
      const { data: existing } = await supabase.storage.from("avatars").list(userId);
      if (existing?.length) {
        await supabase.storage.from("avatars").remove(existing.map((f) => `${userId}/${f.name}`));
      }

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", userId);

      setPreview(publicUrl);
      onUploaded?.(publicUrl);
      toast.success(t("profile.avatarUpdated", "Profile picture updated"));
    } catch (err: any) {
      toast.error(err.message || t("profile.avatarUploadFailed", "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const displayUrl = preview || avatarUrl;

  return (
    <div
      className={cn("relative group", editable && "cursor-pointer")}
      onClick={() => editable && inputRef.current?.click()}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      onKeyDown={(e) => editable && e.key === "Enter" && inputRef.current?.click()}
      aria-label={editable ? t("profile.changeAvatar", "Change profile picture") : undefined}
    >
      <Avatar className={cn(sizeClasses, "rounded-xl")}>
        {displayUrl && <AvatarImage src={displayUrl} alt="Avatar" />}
        <AvatarFallback className="rounded-xl bg-primary/10 text-primary font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>
      {editable && (
        <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera className="w-4 h-4 text-white" />
        </div>
      )}
      {uploading && (
        <div className="absolute inset-0 rounded-xl bg-background/60 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {editable && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUpload}
        />
      )}
    </div>
  );
}
