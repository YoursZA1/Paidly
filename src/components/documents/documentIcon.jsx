/**
 * Resolves a document catalog icon name (string from documentCatalog) to a lucide icon component.
 * Falls back to FileText for any unmapped name so a new catalog entry can never crash the UI.
 */
import {
  Receipt,
  Handshake,
  FolderKanban,
  Users,
  Settings2,
  BarChart3,
  CalendarDays,
  FileText,
  FileMinus,
  FilePlus,
  ReceiptText,
  ShoppingCart,
  Wallet,
  Lightbulb,
  FileSignature,
  ListChecks,
  ShieldCheck,
  GitBranch,
  ClipboardList,
  ListTree,
  Palette,
  Activity,
  PackageCheck,
  DollarSign,
  Mail,
  CalendarOff,
  Star,
  BookOpen,
  ClipboardCheck,
  AlertTriangle,
  Truck,
  TrendingUp,
  PieChart,
  Megaphone,
  ListOrdered,
  UserCheck,
} from "lucide-react";
import { getTypeDef, getCategoryDef } from "@/document-engine";

const ICONS = {
  Receipt,
  Handshake,
  FolderKanban,
  Users,
  Settings2,
  BarChart3,
  CalendarDays,
  FileText,
  FileMinus,
  FilePlus,
  ReceiptText,
  ShoppingCart,
  Wallet,
  Lightbulb,
  FileSignature,
  ListChecks,
  ShieldCheck,
  GitBranch,
  ClipboardList,
  ListTree,
  Palette,
  Activity,
  PackageCheck,
  DollarSign,
  Mail,
  CalendarOff,
  Star,
  BookOpen,
  ClipboardCheck,
  AlertTriangle,
  Truck,
  TrendingUp,
  PieChart,
  Megaphone,
  ListOrdered,
  UserCheck,
};

/** @param {string} name */
export function getIconByName(name) {
  return ICONS[name] || FileText;
}

/**
 * Icon for a document type key.
 * @param {{ type: string, className?: string }} props
 */
export function DocumentTypeIcon({ type, className = "h-4 w-4" }) {
  const def = getTypeDef(type);
  const Icon = getIconByName(def?.icon);
  return <Icon className={className} aria-hidden />;
}

/**
 * Icon for a category key.
 * @param {{ category: string, className?: string }} props
 */
export function CategoryIcon({ category, className = "h-4 w-4" }) {
  const def = getCategoryDef(category);
  const Icon = getIconByName(def?.icon);
  return <Icon className={className} aria-hidden />;
}
