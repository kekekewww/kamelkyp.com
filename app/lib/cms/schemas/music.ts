/**
 * Music model (content-schema §2.3, §4). Client-safe.
 */
import { z } from "zod";
import type { AssetRef, CreditItem, LinkItem, LocalizedText } from "../types";
import {
  AssetRefDraft,
  CreditItemDraft,
  creditsToJson,
  IdDraft,
  json,
  LinkItemDraft,
  linksToJson,
  localizedText,
  NonNegativeIntDraft,
  StoredCreditItem,
  StoredLinkItem,
  StoredNullableInt,
  StoredNullableString,
  StoredTextSchema,
  storedArray,
  UrlDraft,
  YearDraft,
} from "./common";

export type MusicContent = {
  projectId: string | null;
  title: LocalizedText;
  artist: LocalizedText;
  role: LocalizedText;
  genre: LocalizedText;
  description: LocalizedText;
  year: number | null;
  credits: CreditItem[];
  artworkId: AssetRef | null;
  audioPreviewId: AssetRef | null;
  fullAudioId: AssetRef | null;
  durationMs: number | null;
  previewStartSeconds: number | null;
  previewEndSeconds: number | null;
  spotifyUrl: string | null;
  youtubeUrl: string | null;
  soundcloudUrl: string | null;
  otherLinks: LinkItem[];
};

export const MUSIC_URL_HOSTS = {
  spotifyUrl: ["open.spotify.com"],
  youtubeUrl: [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
  ],
  soundcloudUrl: ["soundcloud.com", "www.soundcloud.com", "on.soundcloud.com"],
} as const;

function validRange(value: {
  previewStartSeconds: number | null;
  previewEndSeconds: number | null;
}) {
  return (
    value.previewStartSeconds === null ||
    value.previewEndSeconds === null ||
    value.previewEndSeconds > value.previewStartSeconds
  );
}

export const MusicDraftSchema = z
  .object({
    projectId: IdDraft,
    title: localizedText(200),
    artist: localizedText(200),
    role: localizedText(200),
    genre: localizedText(100),
    description: localizedText(4000),
    year: YearDraft,
    credits: z.array(CreditItemDraft).max(40).default([]),
    artworkId: AssetRefDraft,
    audioPreviewId: AssetRefDraft,
    fullAudioId: AssetRefDraft,
    durationMs: NonNegativeIntDraft,
    previewStartSeconds: NonNegativeIntDraft,
    previewEndSeconds: NonNegativeIntDraft,
    spotifyUrl: UrlDraft,
    youtubeUrl: UrlDraft,
    soundcloudUrl: UrlDraft,
    otherLinks: z.array(LinkItemDraft).max(10).default([]),
  })
  .refine(validRange, {
    message: "invalid_preview_range",
    path: ["previewEndSeconds"],
  })
  .transform((value): MusicContent => value);

export const MusicSnapshotSchema = z
  .object({
    schema_version: z.literal(1),
    core: z.object({
      project_id: StoredNullableString,
      title_i18n: StoredTextSchema,
      artist_i18n: StoredTextSchema,
      role_i18n: StoredTextSchema,
      genre_i18n: StoredTextSchema,
      description_i18n: StoredTextSchema,
      year: StoredNullableInt,
      credits: storedArray(StoredCreditItem),
    }),
    media: z.object({
      artwork_id: StoredNullableString,
      audio_preview_id: StoredNullableString,
      full_audio_id: StoredNullableString,
      duration_ms: StoredNullableInt,
      preview_start_seconds: StoredNullableInt,
      preview_end_seconds: StoredNullableInt,
    }),
    links: z.object({
      spotify_url: StoredNullableString,
      youtube_url: StoredNullableString,
      soundcloud_url: StoredNullableString,
      other: storedArray(StoredLinkItem),
    }),
  })
  .transform(
    (snapshot): MusicContent => ({
      projectId: snapshot.core.project_id,
      title: snapshot.core.title_i18n,
      artist: snapshot.core.artist_i18n,
      role: snapshot.core.role_i18n,
      genre: snapshot.core.genre_i18n,
      description: snapshot.core.description_i18n,
      year: snapshot.core.year,
      credits: snapshot.core.credits,
      artworkId: snapshot.media.artwork_id,
      audioPreviewId: snapshot.media.audio_preview_id,
      fullAudioId: snapshot.media.full_audio_id,
      durationMs: snapshot.media.duration_ms,
      previewStartSeconds: snapshot.media.preview_start_seconds,
      previewEndSeconds: snapshot.media.preview_end_seconds,
      spotifyUrl: snapshot.links.spotify_url,
      youtubeUrl: snapshot.links.youtube_url,
      soundcloudUrl: snapshot.links.soundcloud_url,
      otherLinks: snapshot.links.other,
    }),
  );

export function musicContentToColumns(
  content: MusicContent,
): Record<string, string | number | null> {
  return {
    project_id: content.projectId,
    title_i18n: json(content.title),
    artist_i18n: json(content.artist),
    role_i18n: json(content.role),
    genre_i18n: json(content.genre),
    description_i18n: json(content.description),
    year: content.year,
    credits_json: creditsToJson(content.credits),
    artwork_id: content.artworkId,
    audio_preview_id: content.audioPreviewId,
    full_audio_id: content.fullAudioId,
    duration_ms: content.durationMs,
    preview_start_seconds: content.previewStartSeconds,
    preview_end_seconds: content.previewEndSeconds,
    spotify_url: content.spotifyUrl,
    youtube_url: content.youtubeUrl,
    soundcloud_url: content.soundcloudUrl,
    other_links_json: linksToJson(content.otherLinks),
  };
}
