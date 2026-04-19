import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  FileText, Users, Sparkles, MessageSquareText, Tags, Languages, Download,
  Share2, History, User, Settings, CreditCard, Shield, Clock, Calendar, Edit3, ArrowRight,
} from "lucide-react";
import { features } from "@/content/help/features";
import { pickLocale } from "@/content/help/pickLocale";

const ICONS = {
  fileText: FileText,
  users: Users,
  sparkles: Sparkles,
  messageSquareText: MessageSquareText,
  tags: Tags,
  languages: Languages,
  download: Download,
  share2: Share2,
  history: History,
  user: User,
  settings: Settings,
  creditCard: CreditCard,
  shield: Shield,
  clock: Clock,
  calendar: Calendar,
  edit3: Edit3,
} as const;

interface HelpFeatureGridProps {
  filter: string;
}

function matches(text: string, filter: string) {
  if (!filter) return true;
  return text.toLowerCase().includes(filter.toLowerCase());
}

export default function HelpFeatureGrid({ filter }: HelpFeatureGridProps) {
  const { t, i18n } = useTranslation();

  const filteredGroups = useMemo(() => {
    if (!filter) return features;
    return features
      .map((group) => {
        const groupTitle = pickLocale(group.title, i18n.language);
        const items = group.items.filter((item) => {
          const haystack = `${groupTitle} ${pickLocale(item.title, i18n.language)} ${pickLocale(item.body, i18n.language)}`;
          return matches(haystack, filter);
        });
        return { ...group, items };
      })
      .filter((g) => g.items.length > 0);
  }, [filter, i18n.language]);

  if (filter && filteredGroups.length === 0) return null;

  return (
    <section id="features" className="container mx-auto px-5 sm:px-6 py-10 scroll-mt-24">
      <div className="mb-6">
        <h2 className="text-h1 sm:text-[1.5rem] mb-1">
          {t("help.features.title")}
        </h2>
        <p className="text-secondary text-muted-foreground">{t("help.features.lead")}</p>
      </div>

      <div className="space-y-8">
        {filteredGroups.map((group) => (
          <div key={group.id}>
            <h3 className="text-micro mb-3 text-muted-foreground">
              {pickLocale(group.title, i18n.language)}
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const card = (
                  <div className="h-full rounded-2xl border border-border bg-card p-4 shadow-sm hover:border-primary/30 hover:shadow-md transition-all">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-primary" aria-hidden />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-secondary mb-1 leading-snug">
                          {pickLocale(item.title, i18n.language)}
                        </h4>
                        <p className="text-caption text-muted-foreground leading-relaxed">
                          {pickLocale(item.body, i18n.language)}
                        </p>
                        {item.href && (
                          <span className="inline-flex items-center gap-1 text-caption text-primary mt-2">
                            {t("help.features.openLink")}
                            <ArrowRight className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
                return item.href ? (
                  <Link key={item.id} to={item.href} className="block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-2xl">
                    {card}
                  </Link>
                ) : (
                  <div key={item.id}>{card}</div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
