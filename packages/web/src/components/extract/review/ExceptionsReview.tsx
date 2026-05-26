import type { PermittedExceptionProposal } from "../../../api/extract";
import type { PermittedException } from "../../../api/manifest";
import { ExceptionsTable } from "../../manifest/ExceptionsTable";

interface ExceptionsReviewProps {
  values: PermittedExceptionProposal[];
  onChange: (next: PermittedExceptionProposal[]) => void;
}

export function ExceptionsReview({ values, onChange }: ExceptionsReviewProps): JSX.Element {
  // PermittedExceptionProposal and PermittedException share the same shape { term, reason }
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-100">Permitted exceptions</h2>
      <ExceptionsTable
        values={values as PermittedException[]}
        onChange={(next) => onChange(next as PermittedExceptionProposal[])}
      />
    </section>
  );
}
