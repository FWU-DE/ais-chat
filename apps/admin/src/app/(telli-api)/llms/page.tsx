import { LargeLanguageModelListView } from './LargeLanguageModelListView';
import { getLargeLanguageModelsAction } from './actions';

export default async function LargeLanguageModelsPage() {
  const initialData = await getLargeLanguageModelsAction();
  return <LargeLanguageModelListView initialData={initialData} />;
}
