import { useTranslations } from 'next-intl';
import { CustomChatFieldInfo } from '../custom-chat-field-info';

export function CustomChatLicenseInformationView({
  licenseInformation,
}: {
  licenseInformation: string;
}) {
  const t = useTranslations('custom-chat.license-information');

  if (licenseInformation.trim() === '') {
    return null;
  }

  return <CustomChatFieldInfo label={t('heading')} value={licenseInformation} />;
}
