'use client';

import { AutoForm } from '@/components/autoform/react-hook-form';
import z from 'zod';
import { fieldConfig, ZodProvider } from '@autoform/zod';
import { FederalStateModel } from '@shared/federal-states/types';
import {
  federalStateFeatureTogglesSchema,
  federalStatePictureUrlsSchema,
  federalStateUpdateSchema,
} from '@shared/db/schema';
import { DesignConfigurationSchema } from '@ui/types/design-configuration';

const mySchema = federalStateUpdateSchema.extend({
  id: z.string().check(
    fieldConfig({
      label: 'My ID',
      customData: { myCustomKey: 'myCustomValue' },
      description: 'This is my custom ID field',
      inputProps: { disabled: true },
    }),
  ),
  featureToggles: federalStateFeatureTogglesSchema,
  designConfiguration: DesignConfigurationSchema,
  pictureUrls: federalStatePictureUrlsSchema,
});
const schemaProvider = new ZodProvider(mySchema);

export type FederalStateAutoFormProps = {
  federalState: FederalStateModel;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function onSubmit(data: unknown, form: unknown, event?: React.BaseSyntheticEvent) {
  console.log(data);
}

export default function FederalStateAutoForm({ federalState }: FederalStateAutoFormProps) {
  return (
    <AutoForm schema={schemaProvider} defaultValues={federalState} onSubmit={onSubmit} withSubmit />
  );
}
