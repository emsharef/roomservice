import { logger, task, wait } from "@trigger.dev/sdk/v3";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeArtwork } from "@/lib/vision";
import { generateImageEmbedding, generateTextEmbedding } from "@/lib/embeddings";

export const analyzeNewArtworks = task({
  id: "analyze-new-artworks",
  maxDuration: 3600, // 1 hour max
  run: async () => {
    const admin = createAdminClient();

    // Find artworks that have an image but haven't been analyzed yet
    const { data: artworks, error: queryError } = await admin
      .from("artworks")
      .select(
        "id, title, medium, primary_image_url, artwork_artists(display_name)"
      )
      .not("primary_image_url", "is", null)
      .filter(
        "id",
        "in",
        // Subquery: artworks_extended where vision_analyzed_at is null
        `(SELECT artwork_id FROM artworks_extended WHERE vision_analyzed_at IS NULL)`
      )
      .limit(100); // Process up to 100 at a time

    // Fallback: query artworks_extended directly if the filter doesn't work
    let toProcess = artworks;
    if (queryError || !artworks?.length) {
      logger.info("Using fallback query for unanalyzed artworks");
      const { data: unanalyzed } = await admin
        .from("artworks_extended")
        .select("artwork_id")
        .is("vision_analyzed_at", null)
        .limit(100);

      if (!unanalyzed?.length) {
        logger.info("No unanalyzed artworks found");
        return { processed: 0, analyzed: 0, errors: 0 };
      }

      const artworkIds = unanalyzed.map((r) => r.artwork_id);
      const { data: artworksData } = await admin
        .from("artworks")
        .select(
          "id, title, medium, primary_image_url, artwork_artists(display_name)"
        )
        .in("id", artworkIds)
        .not("primary_image_url", "is", null);

      toProcess = artworksData;
    }

    if (!toProcess?.length) {
      logger.info("No artworks to analyze");
      return { processed: 0, analyzed: 0, errors: 0 };
    }

    logger.info(`Found ${toProcess.length} artworks to analyze`);

    let analyzed = 0;
    let errors = 0;

    for (const artwork of toProcess) {
      try {
        // Mark as processing
        await admin
          .from("artworks_extended")
          .update({
            enrichment_status: "processing",
            updated_at: new Date().toISOString(),
          })
          .eq("artwork_id", artwork.id);

        const artistNames =
          (artwork.artwork_artists || [])
            .map((a: { display_name: string }) => a.display_name)
            .join(", ") || "Unknown artist";

        // Run Claude Vision analysis
        const analysis = await analyzeArtwork(
          artwork.primary_image_url!,
          artwork.title,
          artistNames,
          artwork.medium
        );

        // Generate CLIP embedding
        let clipEmbedding: number[] | null = null;
        try {
          clipEmbedding = await generateImageEmbedding(
            artwork.primary_image_url!
          );
        } catch (e) {
          logger.warn(`CLIP embedding failed for ${artwork.id}`, {
            error: String(e),
          });
        }

        // Generate description embedding
        let descriptionEmbedding: number[] | null = null;
        try {
          if (analysis.description) {
            descriptionEmbedding = await generateTextEmbedding(
              analysis.description
            );
          }
        } catch (e) {
          logger.warn(`Description embedding failed for ${artwork.id}`, {
            error: String(e),
          });
        }

        // Store results
        const updateData: Record<string, unknown> = {
          ai_description: analysis.description,
          style_tags: analysis.style_tags,
          subject_tags: analysis.subject_tags,
          mood_tags: analysis.mood_tags,
          color_palette: analysis.color_palette,
          vision_analyzed_at: new Date().toISOString(),
          enrichment_status: "complete",
          enrichment_error: null,
          updated_at: new Date().toISOString(),
        };

        if (clipEmbedding) {
          updateData.clip_embedding = clipEmbedding;
          updateData.clip_generated_at = new Date().toISOString();
        }

        if (descriptionEmbedding) {
          updateData.description_embedding = descriptionEmbedding;
        }

        await admin
          .from("artworks_extended")
          .update(updateData)
          .eq("artwork_id", artwork.id);

        analyzed++;
        logger.info(`Analyzed artwork ${artwork.id}: ${artwork.title}`, {
          analyzed,
          total: toProcess.length,
        });

        // Rate limit: wait 2s between artworks
        if (analyzed < toProcess.length) {
          await wait.for({ seconds: 2 });
        }
      } catch (e) {
        errors++;
        logger.error(`Failed to analyze artwork ${artwork.id}`, {
          error: String(e),
        });

        // Store error
        await admin
          .from("artworks_extended")
          .update({
            enrichment_status: "error",
            enrichment_error: String(e),
            updated_at: new Date().toISOString(),
          })
          .eq("artwork_id", artwork.id);

        // Continue to next artwork
        await wait.for({ seconds: 2 });
      }
    }

    logger.info("Analysis complete", {
      total: toProcess.length,
      analyzed,
      errors,
    });

    return { processed: toProcess.length, analyzed, errors };
  },
});
