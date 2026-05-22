import { ExternalServiceError } from "../../core/errors.js";

export class DynamoCacheRepository {
  constructor({ tableName }) {
    this.tableName = tableName;
    this.clientPromise = null;
  }

  async getClient() {
    if (this.clientPromise) {
      return this.clientPromise;
    }

    this.clientPromise = (async () => {
      const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
      const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
      const client = new DynamoDBClient({});
      return DynamoDBDocumentClient.from(client, {
        marshallOptions: {
          removeUndefinedValues: true
        }
      });
    })();

    return this.clientPromise;
  }

  async get(key) {
    try {
      const client = await this.getClient();
      const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
      const result = await client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { cacheKey: key }
        })
      );

      if (!result.Item || !result.Item.payload) {
        return null;
      }

      if (result.Item.expiresAt && result.Item.expiresAt <= Math.floor(Date.now() / 1000)) {
        return null;
      }

      return result.Item.payload;
    } catch (error) {
      throw new ExternalServiceError("Failed to read cache from DynamoDB", { message: error.message });
    }
  }

  async set(key, payload, ttlSeconds) {
    try {
      const client = await this.getClient();
      const { PutCommand } = await import("@aws-sdk/lib-dynamodb");
      await client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            cacheKey: key,
            payload,
            expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds
          }
        })
      );
    } catch (error) {
      throw new ExternalServiceError("Failed to write cache to DynamoDB", { message: error.message });
    }
  }
}

