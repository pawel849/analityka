// Proste ikony elementów mapy (lucide, licencja ISC) – żeby na pierwszy rzut oka odróżnić reklamę, stronę, akcję.
import {
  ArrowDownToLine, BadgeDollarSign, BookOpen, Briefcase, Building2, Calendar, CalendarCheck, CalendarPlus, CircleCheck, CirclePlay,
  ClipboardList, ClipboardPen, Download, FileText, GitBranch, Globe, Handshake, House, Link, Lock, Mail, Megaphone, MessageCircle,
  MessagesSquare, MonitorPlay, MousePointer, MousePointerClick, Navigation, Newspaper, PanelTop, PartyPopper, Phone, Play, Presentation,
  QrCode, Radio, RotateCcw, Search, Send, Share2, ShoppingBag, ShoppingCart, Signpost, Smartphone, StickyNote, Ticket, TrendingDown,
  TrendingUp, Trophy, Tv, UserPlus, Users, Workflow, Zap, type LucideIcon,
} from "lucide-react";
import { CATALOG_BY_KIND } from "@/lib/catalog";

const BY_KIND: Record<string, LucideIcon> = {
  // źródła
  youtube_ads: CirclePlay, youtube: CirclePlay, google_search: Search, bing_search: Search, organic: Search,
  email: Mail, mailerlite: Mail, getresponse: Mail, mailchimp: Mail, activecampaign: Mail, constant_contact: Mail, drip: Mail, gmail: Mail,
  kajabi: BookOpen, direct: Navigation, affiliate: Handshake, chat_box: MessagesSquare, messenger: MessageCircle, whatsapp: MessageCircle,
  telegram: MessageCircle, slack: MessagesSquare, sms: Smartphone, chatbot: MessagesSquare, qr_code: QrCode, phone_src: Phone, tv_ad: Tv,
  radio: Radio, print_ad: Newspaper, billboard: Signpost, banner: Signpost, conference: Presentation, workshop: Presentation,
  online_meeting: Presentation, meeting_src: Users, business_card: Ticket, direct_mail: Mail, report: BookOpen, guest_blog: Newspaper,
  biz_directory: Building2, job_site: Briefcase, career_site: Briefcase, job_interview: Briefcase, google_maps: Globe,
  // strony
  landing: PanelTop, optin: ClipboardPen, download: Download, popup: PanelTop, sales: BadgeDollarSign, vsl: CirclePlay,
  webinar_reg: CalendarPlus, webinar: MonitorPlay, replay: RotateCcw, application: ClipboardList, booking: Calendar,
  checkout: ShoppingCart, upsell: TrendingUp, downsell: TrendingDown, oto: Zap, thankyou: PartyPopper, members: Lock,
  blog: Newspaper, home: House, page_custom: FileText,
  // akcje
  purchase: ShoppingBag, lead: UserPlus, form_submit: Send, booking_done: CalendarCheck, deal_won: Trophy, add_to_cart: ShoppingCart,
  video_play: Play, link_click: Link, button_click: MousePointerClick, click: MousePointer, scroll: ArrowDownToLine,
  deal_status: GitBranch, ghl_appointment: CalendarCheck, ghl_order: ShoppingBag, ghl_opportunity: Workflow,
  ghl_opportunity_won: Trophy, hubspot_deal: Briefcase, hubspot_deal_won: Trophy, action_custom: Zap,
  // offline
  call: Phone, meeting: Users, email_msg: Mail, note: StickyNote,
};

const BY_GROUP: Record<string, LucideIcon> = {
  "Reklamy płatne": Megaphone,
  Wyszukiwarki: Search,
  "Social (organicznie)": Share2,
  "CRM i e-mail": Mail,
  Komunikatory: MessageCircle,
  "Inne serwisy": Globe,
  "Inne źródła": Globe,
  Offline: Users,
};

export function iconFor(kind: string): LucideIcon {
  const item = CATALOG_BY_KIND[kind];
  return BY_KIND[kind] ?? (item ? BY_GROUP[item.group] : undefined) ?? (item?.category === "action" ? Zap : item?.category === "page" ? FileText : CircleCheck);
}

export function KindIcon({ kind, size = 16 }: { kind: string; size?: number }) {
  const Icon = iconFor(kind);
  return <Icon size={size} strokeWidth={2.2} aria-hidden />;
}
