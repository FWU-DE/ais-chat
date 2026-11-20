import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/card';
import { useTranslations } from 'next-intl';

import { SUPPORTED_DOCUMENTS_EXTENSIONS } from '@/const';

import { CustomChatHeading2 } from '../custom-chat-heading2';
import { CustomChatFiles, CustomChatFilesProps } from './custom-chat-files';
import { CustomChatLinks, CustomChatLinksProps } from './custom-chat-links';

type CustomChatFilesAndLinksProps = CustomChatFilesProps & CustomChatLinksProps;

export function CustomChatFilesAndLinks(props: CustomChatFilesAndLinksProps) {
  const t = useTranslations('custom-chat.files-and-links');
  const filesVisible = props.initialFiles.length > 0 || !!props.onFileUploaded;
  const linksVisible = props.initialLinks.length > 0 || !!props.onLinksChange;

  return (
    <>
      {(filesVisible || linksVisible) && (
        <div className="flex flex-col gap-3 mt-10">
          <CustomChatHeading2
            text={t('heading')}
            tooltip={t('heading-tooltip', {
              supported_formats: SUPPORTED_DOCUMENTS_EXTENSIONS.join(', '),
            })}
          />

          {filesVisible && (
            <Card>
              <CardHeader>
                <CardTitle>{t('files')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CustomChatFiles
                  initialFiles={props.initialFiles}
                  onFileUploaded={props.onFileUploaded}
                  onDeleteFile={props.onDeleteFile}
                  onDownloadFile={props.onDownloadFile}
                />
              </CardContent>
            </Card>
          )}

          {linksVisible && (
            <Card>
              <CardHeader>
                <CardTitle tooltipAriaLabel={t('links')} tooltipContent={t('links-tooltip')}>
                  {t('links')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CustomChatLinks
                  initialLinks={props.initialLinks}
                  onLinksChange={props.onLinksChange}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
