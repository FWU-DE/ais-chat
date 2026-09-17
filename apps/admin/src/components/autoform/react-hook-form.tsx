'use client';

import { AutoForm as ReactHookFormAutoForm } from '@autoform/react/react-hook-form';
import type {
  AutoFormUIComponents,
  AutoFormProps as BaseAutoFormProps,
  ExtendableAutoFormProps,
} from '@autoform/react';
import { ArrayElementWrapper } from './components/ArrayElementWrapper';
import { ArrayWrapper } from './components/ArrayWrapper';
import { ErrorMessage } from './components/ErrorMessage';
import { FieldWrapper } from './components/FieldWrapper';
import { Form } from './components/Form';
import { ObjectWrapper } from './components/ObjectWrapper';
import { SubmitButton } from './components/SubmitButton';
import { BooleanField } from './components/rhf/BooleanField';
import { DateField } from './components/rhf/DateField';
import { NumberField } from './components/rhf/NumberField';
import { SelectField } from './components/rhf/SelectField';
import { StringField } from './components/rhf/StringField';

export type FieldTypes = 'string' | 'number' | 'boolean' | 'date' | 'select';
export type { ExtendableAutoFormProps as AutoFormProps } from '@autoform/react';

const UIComponents: AutoFormUIComponents = {
  Form,
  FieldWrapper,
  ErrorMessage,
  SubmitButton,
  ObjectWrapper,
  ArrayWrapper,
  ArrayElementWrapper,
};

const RHFFieldComponents = {
  string: StringField,
  number: NumberField,
  boolean: BooleanField,
  date: DateField,
  select: SelectField,
} as const;

export function AutoForm<T extends Record<string, unknown> = Record<string, unknown>>({
  uiComponents,
  formComponents,
  ...props
}: ExtendableAutoFormProps<T>) {
  return (
    <ReactHookFormAutoForm
      {...(props as BaseAutoFormProps<T>)}
      uiComponents={{ ...UIComponents, ...uiComponents }}
      formComponents={{ ...RHFFieldComponents, ...formComponents }}
    />
  );
}
