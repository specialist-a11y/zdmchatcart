import { redirect } from "next/navigation";

/** Videos became Content (photos and videos, plus scheduling). Old links from WhatsApp messages land here. */
export default async function VideosMoved({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/dashboard/${slug}/content`);
}
