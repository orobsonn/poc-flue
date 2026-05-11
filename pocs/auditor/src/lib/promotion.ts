const MIN_DISTINCT_BUCKETS = 3;
const SINGLE_BUCKET_MIN_SIZE = 20;

/** @description Regra de promoção do spec §6.4: cross-bucket OU single-bucket grande high-conf. */
export function shouldPromoteToFinding(input: {
  distinct_buckets_count: number;
  max_bucket_size: number;
  confidence: 'high' | 'med' | 'low';
}): boolean {
  const crossBucket = input.distinct_buckets_count >= MIN_DISTINCT_BUCKETS;
  const singleBucketHighConf =
    input.max_bucket_size > SINGLE_BUCKET_MIN_SIZE && input.confidence === 'high';
  return crossBucket || singleBucketHighConf;
}
