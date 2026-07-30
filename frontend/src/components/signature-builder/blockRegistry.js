import { ImagePlus, User, Quote, Phone, Share2, Minus, Scale, MousePointerClick, QrCode, Megaphone } from "lucide-react";
import PhotoBlock from "./blocks/PhotoBlock";
import IdentityBlock from "./blocks/IdentityBlock";
import TaglineBlock from "./blocks/TaglineBlock";
import ContactBlock from "./blocks/ContactBlock";
import SocialBlock from "./blocks/SocialBlock";
import DividerBlock from "./blocks/DividerBlock";
import LegalBlock from "./blocks/LegalBlock";
import CtaBlock from "./blocks/CtaBlock";
import QrCodeBlock from "./blocks/QrCodeBlock";
import BannerBlock from "./blocks/BannerBlock";

// Single source of truth: block type -> icon/label (for the "Add block"
// picker and the canvas card header) + editor Component + default data.
export const BLOCK_REGISTRY = {
  photo: { label: "Photo / Logo", icon: ImagePlus, Component: PhotoBlock, defaultData: () => ({ imageUrl: "", shape: "circle", size: 80 }) },
  identity: { label: "Name & Title", icon: User, Component: IdentityBlock, defaultData: () => ({ name: "", title: "", department: "", company: "" }) },
  tagline: { label: "Tagline", icon: Quote, Component: TaglineBlock, defaultData: () => ({ text: "" }) },
  contact: { label: "Contact info", icon: Phone, Component: ContactBlock, defaultData: () => ({ rows: [] }) },
  social: { label: "Social links", icon: Share2, Component: SocialBlock, defaultData: () => ({ items: [] }) },
  divider: { label: "Divider", icon: Minus, Component: DividerBlock, defaultData: () => ({ style: "solid" }) },
  legal: { label: "Legal / disclaimer", icon: Scale, Component: LegalBlock, defaultData: () => ({ html: "" }) },
  cta: { label: "Button", icon: MousePointerClick, Component: CtaBlock, defaultData: () => ({ label: "", url: "", style: "filled" }) },
  qrcode: { label: "QR code", icon: QrCode, Component: QrCodeBlock, defaultData: () => ({ value: "", imageUrl: "" }) },
  banner: { label: "Banner / campaign", icon: Megaphone, Component: BannerBlock, defaultData: () => ({ items: [] }) },
};

export const newBlock = (type) => ({
  id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  type,
  visible: true,
  data: BLOCK_REGISTRY[type].defaultData(),
});
