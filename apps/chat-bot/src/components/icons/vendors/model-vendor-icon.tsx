import AlibabaCloudIcon from '@lobehub/icons-static-svg/icons/alibabacloud-color.svg';
import BaaiIcon from '@lobehub/icons-static-svg/icons/baai.svg';
import BflIcon from '@lobehub/icons-static-svg/icons/bfl.svg';
import AnthropicIcon from '@lobehub/icons-static-svg/icons/claude-color.svg';
import GoogleIcon from '@lobehub/icons-static-svg/icons/google-color.svg';
import MetaIcon from '@lobehub/icons-static-svg/icons/meta-color.svg';
import MicrosoftIcon from '@lobehub/icons-static-svg/icons/microsoft-color.svg';
import MistralIcon from '@lobehub/icons-static-svg/icons/mistral-color.svg';
import OpenAiIcon from '@lobehub/icons-static-svg/icons/openai.svg';
import { CubeIcon } from '@phosphor-icons/react';
import type { ComponentType, SVGProps } from 'react';

const VENDOR_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  openai: OpenAiIcon,
  anthropic: AnthropicIcon,
  google: GoogleIcon,
  meta: MetaIcon,
  mistral: MistralIcon,
  alibabacloud: AlibabaCloudIcon,
  microsoft: MicrosoftIcon,
  baai: BaaiIcon,
  bfl: BflIcon,
};

export function ModelVendorIcon({
  vendor,
  ...props
}: { vendor: string | null } & SVGProps<SVGSVGElement>) {
  const Icon = (vendor && VENDOR_ICONS[vendor]) || CubeIcon;
  return <Icon aria-hidden="true" {...props} />;
}
