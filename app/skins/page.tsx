import SkinTable from './SkinTable';
import SkinRefreshButton from './SkinRefreshButton';
import CollectionStats from './CollectionStats';

export default function SkinsPage() {
  return (
    <div>
      <h1>Skin Collection Tracker</h1>

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading">Collection Progress</h2>
        <CollectionStats />
      </section>

      <section aria-labelledby="refresh-heading">
        <h2 id="refresh-heading">Catalog Management</h2>
        <SkinRefreshButton />
      </section>

      <section aria-labelledby="table-heading">
        <h2 id="table-heading">Unowned Skins</h2>
        <SkinTable />
      </section>
    </div>
  );
}
