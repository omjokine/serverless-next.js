import { CloudFrontRequest, CloudFrontResultResponse } from "aws-lambda";
import { OriginRequestEvent } from "./types";
export declare const handler: (event: OriginRequestEvent) => Promise<CloudFrontRequest | CloudFrontResultResponse>;
