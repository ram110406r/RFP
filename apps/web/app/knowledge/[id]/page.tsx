import { KnowledgeDetailPage as KnowledgeDetailView } from "../../../components/knowledge-brain-pages";

export default async function KnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KnowledgeDetailView knowledgeId={id} />;
}
