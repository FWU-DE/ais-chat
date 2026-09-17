'use client';

import { AutoForm } from '@/components/autoform/react-hook-form';
import z from 'zod';
import { ZodProvider } from '@autoform/zod';

const mySchema = z.object({
  name: z.string(),
  age: z.coerce.number(),
  birthday: z.coerce.date(),
});
const schemaProvider = new ZodProvider(mySchema);

export default function TestForm() {
  return (
    <AutoForm
      schema={schemaProvider}
      onSubmit={(data, form) => {
        console.log(data);
      }}
      withSubmit
    />
  );
}
