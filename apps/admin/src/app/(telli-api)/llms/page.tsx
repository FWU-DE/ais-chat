import { getLargeLanguageModelsAction } from './actions';
import { LargeLanguageModelListView } from './LargeLanguageModelListView';

export default async function LargeLanguageModelsPage() {
  const initialData = await getLargeLanguageModelsAction();
  return <LargeLanguageModelListView initialData={initialData} />;
}
