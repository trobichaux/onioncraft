import ApiKeyForm from './ApiKeyForm';
import ExclusionListEditor from './ExclusionListEditor';
import CharacterFilter from './CharacterFilter';

export default function SettingsPage() {
  return (
    <div>
      <h1>Settings</h1>

      <section aria-labelledby="api-key-heading">
        <h2 id="api-key-heading">API Key Management</h2>
        <ApiKeyForm />
      </section>

      <section aria-labelledby="exclusion-list-heading">
        <h2 id="exclusion-list-heading">Exclusion List</h2>
        <ExclusionListEditor />
      </section>

      <section aria-labelledby="character-filter-heading">
        <h2 id="character-filter-heading">Character Filter</h2>
        <CharacterFilter />
      </section>

      <section aria-labelledby="priority-rules-heading">
        <h2 id="priority-rules-heading">Priority Rules</h2>
        <p>Priority rules editor coming in Phase 5.</p>
      </section>
    </div>
  );
}
