import GoalsPanel from './GoalsPanel';
import ProfitTable from './ProfitTable';
import RefreshButton from './RefreshButton';

export default function CraftingPage() {
  return (
    <div>
      <h1>Crafting Profit Calculator</h1>

      <section aria-labelledby="goals-heading">
        <h2 id="goals-heading">Crafting Goals</h2>
        <GoalsPanel />
      </section>

      <section aria-labelledby="profit-heading">
        <h2 id="profit-heading">Profit Analysis</h2>
        <RefreshButton />
        <ProfitTable />
      </section>
    </div>
  );
}
