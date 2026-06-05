import { useState } from "react";

import { NewPackDialog } from "../components/packs/NewPackDialog";
import { Button, Card, Icon } from "../components/ui";

export function PacksPage(): JSX.Element {
  const [newOpen, setNewOpen] = useState(false);
  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mx-auto max-w-2xl pt-10">
        <Card className="p-10 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Icon.BookOpen size={24} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your style packs</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            A pack captures a writing voice — banished words, principles, samples, and bios. Pick
            one from the sidebar, or create your first.
          </p>
          <div className="mt-6 flex items-center justify-center">
            <Button onClick={() => setNewOpen(true)}>
              <Icon.Plus size={16} /> New pack
            </Button>
          </div>
        </Card>
      </div>
      <NewPackDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
