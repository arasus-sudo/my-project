// Curated multi-set icon library for CreateEQ's icon picker. Four free,
// MIT-licensed icon libraries, each with its own prop conventions — iconProps()
// below normalizes them into one {size, color} call shape so ElementRender's
// icon-element branch can render any of them without per-set branching there.
import {
  Rocket, Award, Star, Zap, Sparkles, ArrowRight, ArrowUpRight, Check, X, Heart,
  Flame, Trophy, Lightbulb, Target, TrendingUp, Quote, ThumbsUp, MessageCircle,
  Clock, Calendar, Mail, Globe, ShieldCheck, Users, Gift,
  BarChart3, Briefcase, Database, Cloud, Lock, Settings, LayoutGrid, PieChart,
  Megaphone, Puzzle, FlaskConical, Box, Building2, Flag, Presentation, UsersRound,
  KeyRound, Search, Filter, Layers, Compass, Bell, BookOpen, Bookmark, Send,
  Link as LucideLink, Wifi, Server, Code, Terminal, Cpu, Smartphone, Monitor,
  Palette, Play, Video, Camera, Mic, Headphones, Music, FileText, Folder,
  Download, Upload, Share2, Eye,
} from "lucide-react";

import {
  IconRocket, IconChartBar, IconBulb, IconTarget, IconTrophy, IconUsers, IconMail,
  IconGlobe, IconShieldCheck, IconHeart, IconFlame, IconSparkles, IconBolt, IconStar,
  IconCheck, IconClock, IconCalendar, IconGift, IconArrowRight, IconArrowUpRight,
  IconThumbUp, IconMessageCircle, IconTrendingUp, IconQuote, IconAward, IconX,
  IconBriefcase, IconChartPie, IconDatabase, IconCloud, IconLock, IconKey,
  IconSettings, IconLayoutGrid, IconBuildingSkyscraper, IconFlag, IconSpeakerphone,
  IconPuzzle, IconFlask, IconCube, IconSearch, IconFilter, IconLayersIntersect,
  IconCompass, IconBell, IconBook, IconBookmark, IconSend, IconLink, IconWifi,
  IconServer, IconCode, IconTerminal, IconCpu, IconDeviceMobile, IconDeviceDesktop,
  IconPalette, IconPlayerPlay, IconVideo, IconCamera, IconMicrophone, IconHeadphones,
  IconMusic, IconFileText, IconFolder, IconDownload, IconUpload, IconShare, IconEye,
} from "@tabler/icons-react";

import {
  Rocket as PhRocket, ChartBar as PhChartBar, Lightbulb as PhLightbulb,
  Target as PhTarget, Trophy as PhTrophy, Users as PhUsers, UsersThree as PhUsersThree,
  Envelope as PhEnvelope, Globe as PhGlobe, ShieldCheck as PhShieldCheck,
  Heart as PhHeart, Flame as PhFlame, Sparkle as PhSparkle, Lightning as PhLightning,
  Star as PhStar, Check as PhCheck, Clock as PhClock, Calendar as PhCalendar,
  Gift as PhGift, ArrowRight as PhArrowRight, ArrowUpRight as PhArrowUpRight,
  ThumbsUp as PhThumbsUp, ChatCircle as PhChatCircle, TrendUp as PhTrendUp,
  Quotes as PhQuotes, X as PhX, Briefcase as PhBriefcase, Database as PhDatabase,
  Cloud as PhCloud, Lock as PhLock, Key as PhKey, Gear as PhGear,
  Buildings as PhBuildings, SquaresFour as PhSquaresFour, ChartPie as PhChartPie,
  Flag as PhFlag, PuzzlePiece as PhPuzzlePiece, Flask as PhFlask, Cube as PhCube,
  MagnifyingGlass as PhMagnifyingGlass, Funnel as PhFunnel, Stack as PhStack,
  Compass as PhCompass, Bell as PhBell, BookOpen as PhBookOpen,
  Bookmark as PhBookmark, PaperPlaneTilt as PhPaperPlaneTilt, Link as PhLink,
  WifiHigh as PhWifiHigh, HardDrive as PhHardDrive, Code as PhCode,
  Terminal as PhTerminal, Cpu as PhCpu, DeviceMobile as PhDeviceMobile,
  Monitor as PhMonitor, Palette as PhPalette, Play as PhPlay,
  VideoCamera as PhVideoCamera, Camera as PhCamera, Microphone as PhMicrophone,
  Headphones as PhHeadphones, MusicNote as PhMusicNote, FileText as PhFileText,
  Folder as PhFolder, DownloadSimple as PhDownloadSimple,
  UploadSimple as PhUploadSimple, ShareNetwork as PhShareNetwork, Eye as PhEye,
} from "@phosphor-icons/react";

import {
  RocketLaunchIcon, ChartBarIcon, LightBulbIcon, FlagIcon, UserGroupIcon, UsersIcon,
  EnvelopeIcon, GlobeAltIcon, ShieldCheckIcon, HeartIcon, FireIcon, SparklesIcon,
  BoltIcon, StarIcon, CheckCircleIcon, ClockIcon, CalendarIcon, GiftIcon,
  ArrowRightIcon, ArrowUpRightIcon, HandThumbUpIcon, ChatBubbleLeftIcon,
  ArrowTrendingUpIcon, TrophyIcon, XMarkIcon, BriefcaseIcon,
  PresentationChartBarIcon, CircleStackIcon, CloudIcon, LockClosedIcon, KeyIcon,
  Cog6ToothIcon, BuildingOfficeIcon, Squares2X2Icon, ChartPieIcon, MegaphoneIcon,
  PuzzlePieceIcon, BeakerIcon, CubeIcon, MagnifyingGlassIcon, FunnelIcon,
  Square3Stack3DIcon, BellIcon, BookOpenIcon, BookmarkIcon, PaperAirplaneIcon,
  LinkIcon as HeroLinkIcon, WifiIcon, ServerIcon, CodeBracketIcon,
  CommandLineIcon, CpuChipIcon, DevicePhoneMobileIcon, ComputerDesktopIcon,
  SwatchIcon, PlayIcon, VideoCameraIcon, CameraIcon, MicrophoneIcon,
  MusicalNoteIcon, DocumentTextIcon, FolderIcon, ArrowDownTrayIcon,
  ArrowUpTrayIcon, ShareIcon, EyeIcon,
} from "@heroicons/react/24/outline";

import { ILLUSTRATIONS } from "./creqIllustrations";

/** Per-set prop shape: lucide takes {size,color,strokeWidth}; tabler takes
 * {size,color,stroke}; phosphor takes {size,color,weight} (no numeric stroke
 * control); heroicons v2 outline components have a fixed baked-in stroke and
 * only accept className/style (no size prop) — sized via inline style instead;
 * illustration components are hand-written and just take {width,height,color}. */
export function iconProps(set, size, color, stroke = 2) {
  switch (set) {
    case "tabler": return { size, color, stroke };
    case "phosphor": return { size, color, weight: "regular" };
    case "heroicons": return { style: { width: size, height: size, color } };
    case "illustration": return { width: size, height: size, color };
    default: return { size, color, strokeWidth: stroke };
  }
}

const lucideIcons = [
  ["Rocket", Rocket], ["Award", Award], ["Star", Star], ["Zap", Zap], ["Sparkles", Sparkles],
  ["ArrowRight", ArrowRight], ["ArrowUpRight", ArrowUpRight], ["Check", Check], ["X", X], ["Heart", Heart],
  ["Flame", Flame], ["Trophy", Trophy], ["Lightbulb", Lightbulb], ["Target", Target], ["TrendingUp", TrendingUp],
  ["Quote", Quote], ["ThumbsUp", ThumbsUp], ["MessageCircle", MessageCircle], ["Clock", Clock], ["Calendar", Calendar],
  ["Mail", Mail], ["Globe", Globe], ["ShieldCheck", ShieldCheck], ["Users", Users], ["Gift", Gift],
  ["BarChart3", BarChart3], ["Briefcase", Briefcase], ["Database", Database], ["Cloud", Cloud], ["Lock", Lock],
  ["Settings", Settings], ["LayoutGrid", LayoutGrid], ["PieChart", PieChart], ["Megaphone", Megaphone], ["Puzzle", Puzzle],
  ["FlaskConical", FlaskConical], ["Box", Box], ["Building2", Building2], ["Flag", Flag], ["Presentation", Presentation],
  ["UsersRound", UsersRound], ["KeyRound", KeyRound], ["Search", Search], ["Filter", Filter], ["Layers", Layers],
  ["Compass", Compass], ["Bell", Bell], ["BookOpen", BookOpen], ["Bookmark", Bookmark], ["Send", Send],
  ["Link", LucideLink], ["Wifi", Wifi], ["Server", Server], ["Code", Code], ["Terminal", Terminal],
  ["Cpu", Cpu], ["Smartphone", Smartphone], ["Monitor", Monitor], ["Palette", Palette], ["Play", Play],
  ["Video", Video], ["Camera", Camera], ["Mic", Mic], ["Headphones", Headphones], ["Music", Music],
  ["FileText", FileText], ["Folder", Folder], ["Download", Download], ["Upload", Upload], ["Share2", Share2], ["Eye", Eye],
];

const tablerIcons = [
  ["Rocket", IconRocket], ["ChartBar", IconChartBar], ["Bulb", IconBulb], ["Target", IconTarget], ["Trophy", IconTrophy],
  ["Users", IconUsers], ["Mail", IconMail], ["Globe", IconGlobe], ["ShieldCheck", IconShieldCheck], ["Heart", IconHeart],
  ["Flame", IconFlame], ["Sparkles", IconSparkles], ["Bolt", IconBolt], ["Star", IconStar], ["Check", IconCheck],
  ["Clock", IconClock], ["Calendar", IconCalendar], ["Gift", IconGift], ["ArrowRight", IconArrowRight], ["ArrowUpRight", IconArrowUpRight],
  ["ThumbUp", IconThumbUp], ["MessageCircle", IconMessageCircle], ["TrendingUp", IconTrendingUp], ["Quote", IconQuote], ["Award", IconAward],
  ["X", IconX], ["Briefcase", IconBriefcase], ["ChartPie", IconChartPie], ["Database", IconDatabase], ["Cloud", IconCloud],
  ["Lock", IconLock], ["Key", IconKey], ["Settings", IconSettings], ["LayoutGrid", IconLayoutGrid], ["BuildingSkyscraper", IconBuildingSkyscraper],
  ["Flag", IconFlag], ["Speakerphone", IconSpeakerphone], ["Puzzle", IconPuzzle], ["Flask", IconFlask], ["Cube", IconCube],
  ["Search", IconSearch], ["Filter", IconFilter], ["LayersIntersect", IconLayersIntersect], ["Compass", IconCompass], ["Bell", IconBell],
  ["Book", IconBook], ["Bookmark", IconBookmark], ["Send", IconSend], ["Link", IconLink], ["Wifi", IconWifi],
  ["Server", IconServer], ["Code", IconCode], ["Terminal", IconTerminal], ["Cpu", IconCpu], ["DeviceMobile", IconDeviceMobile],
  ["DeviceDesktop", IconDeviceDesktop], ["Palette", IconPalette], ["PlayerPlay", IconPlayerPlay], ["Video", IconVideo], ["Camera", IconCamera],
  ["Microphone", IconMicrophone], ["Headphones", IconHeadphones], ["Music", IconMusic], ["FileText", IconFileText], ["Folder", IconFolder],
  ["Download", IconDownload], ["Upload", IconUpload], ["Share", IconShare], ["Eye", IconEye],
];

const phosphorIcons = [
  ["Rocket", PhRocket], ["ChartBar", PhChartBar], ["Lightbulb", PhLightbulb], ["Target", PhTarget], ["Trophy", PhTrophy],
  ["Users", PhUsers], ["UsersThree", PhUsersThree], ["Envelope", PhEnvelope], ["Globe", PhGlobe], ["ShieldCheck", PhShieldCheck],
  ["Heart", PhHeart], ["Flame", PhFlame], ["Sparkle", PhSparkle], ["Lightning", PhLightning], ["Star", PhStar],
  ["Check", PhCheck], ["Clock", PhClock], ["Calendar", PhCalendar], ["Gift", PhGift], ["ArrowRight", PhArrowRight],
  ["ArrowUpRight", PhArrowUpRight], ["ThumbsUp", PhThumbsUp], ["ChatCircle", PhChatCircle], ["TrendUp", PhTrendUp], ["Quotes", PhQuotes],
  ["X", PhX], ["Briefcase", PhBriefcase], ["Database", PhDatabase], ["Cloud", PhCloud], ["Lock", PhLock],
  ["Key", PhKey], ["Gear", PhGear], ["Buildings", PhBuildings], ["SquaresFour", PhSquaresFour], ["ChartPie", PhChartPie],
  ["Flag", PhFlag], ["PuzzlePiece", PhPuzzlePiece], ["Flask", PhFlask], ["Cube", PhCube], ["MagnifyingGlass", PhMagnifyingGlass],
  ["Funnel", PhFunnel], ["Stack", PhStack], ["Compass", PhCompass], ["Bell", PhBell], ["BookOpen", PhBookOpen],
  ["Bookmark", PhBookmark], ["PaperPlaneTilt", PhPaperPlaneTilt], ["Link", PhLink], ["WifiHigh", PhWifiHigh], ["HardDrive", PhHardDrive],
  ["Code", PhCode], ["Terminal", PhTerminal], ["Cpu", PhCpu], ["DeviceMobile", PhDeviceMobile], ["Monitor", PhMonitor],
  ["Palette", PhPalette], ["Play", PhPlay], ["VideoCamera", PhVideoCamera], ["Camera", PhCamera], ["Microphone", PhMicrophone],
  ["Headphones", PhHeadphones], ["MusicNote", PhMusicNote], ["FileText", PhFileText], ["Folder", PhFolder], ["DownloadSimple", PhDownloadSimple],
  ["UploadSimple", PhUploadSimple], ["ShareNetwork", PhShareNetwork], ["Eye", PhEye],
];

const heroiconsIcons = [
  ["RocketLaunch", RocketLaunchIcon], ["ChartBar", ChartBarIcon], ["LightBulb", LightBulbIcon], ["Flag", FlagIcon], ["UserGroup", UserGroupIcon],
  ["Users", UsersIcon], ["Envelope", EnvelopeIcon], ["GlobeAlt", GlobeAltIcon], ["ShieldCheck", ShieldCheckIcon], ["Heart", HeartIcon],
  ["Fire", FireIcon], ["Sparkles", SparklesIcon], ["Bolt", BoltIcon], ["Star", StarIcon], ["CheckCircle", CheckCircleIcon],
  ["Clock", ClockIcon], ["Calendar", CalendarIcon], ["Gift", GiftIcon], ["ArrowRight", ArrowRightIcon], ["ArrowUpRight", ArrowUpRightIcon],
  ["HandThumbUp", HandThumbUpIcon], ["ChatBubbleLeft", ChatBubbleLeftIcon], ["ArrowTrendingUp", ArrowTrendingUpIcon], ["Trophy", TrophyIcon], ["XMark", XMarkIcon],
  ["Briefcase", BriefcaseIcon], ["PresentationChartBar", PresentationChartBarIcon], ["CircleStack", CircleStackIcon], ["Cloud", CloudIcon], ["LockClosed", LockClosedIcon],
  ["Key", KeyIcon], ["Cog6Tooth", Cog6ToothIcon], ["BuildingOffice", BuildingOfficeIcon], ["Squares2X2", Squares2X2Icon], ["ChartPie", ChartPieIcon],
  ["Megaphone", MegaphoneIcon], ["PuzzlePiece", PuzzlePieceIcon], ["Beaker", BeakerIcon], ["Cube", CubeIcon], ["MagnifyingGlass", MagnifyingGlassIcon],
  ["Funnel", FunnelIcon], ["Square3Stack3D", Square3Stack3DIcon], ["Bell", BellIcon], ["BookOpen", BookOpenIcon], ["Bookmark", BookmarkIcon],
  ["PaperAirplane", PaperAirplaneIcon], ["Link", HeroLinkIcon], ["Wifi", WifiIcon], ["Server", ServerIcon], ["CodeBracket", CodeBracketIcon],
  ["CommandLine", CommandLineIcon], ["CpuChip", CpuChipIcon], ["DevicePhoneMobile", DevicePhoneMobileIcon], ["ComputerDesktop", ComputerDesktopIcon], ["Swatch", SwatchIcon],
  ["Play", PlayIcon], ["VideoCamera", VideoCameraIcon], ["Camera", CameraIcon], ["Microphone", MicrophoneIcon], ["MusicalNote", MusicalNoteIcon],
  ["DocumentText", DocumentTextIcon], ["Folder", FolderIcon], ["ArrowDownTray", ArrowDownTrayIcon], ["ArrowUpTray", ArrowUpTrayIcon], ["Share", ShareIcon],
  ["Eye", EyeIcon],
];

const illustrationIcons = ILLUSTRATIONS.map((i) => [i.name, i.Component]);

export const ICON_SETS = [
  { id: "lucide", label: "Lucide", icons: lucideIcons },
  { id: "tabler", label: "Tabler", icons: tablerIcons },
  { id: "phosphor", label: "Phosphor", icons: phosphorIcons },
  { id: "heroicons", label: "Heroicons", icons: heroiconsIcons },
  { id: "illustration", label: "Illustrations", icons: illustrationIcons },
];

/** Flat, searchable list — {set, name, Component} — for the icon picker. */
export const ALL_ICONS = ICON_SETS.flatMap(({ id, icons }) =>
  icons.map(([name, Component]) => ({ set: id, name, Component }))
);

/** Looks up an icon across all four sets by (set, name) — used by
 * ElementRender for icon-type elements. Falls back to lucide's Zap so an
 * element with a stale/unknown name still renders something. */
export function findIcon(set, name) {
  const list = (ICON_SETS.find((s) => s.id === set) || ICON_SETS[0]).icons;
  const hit = list.find(([n]) => n === name);
  return hit ? hit[1] : Zap;
}
