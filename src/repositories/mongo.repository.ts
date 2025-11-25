import { Collection } from "mongodb";
import {
  MongoResource,
  Workspace,
  getWorkspaceCollectionName,
} from "../types/index.js";
import { MongoConnection } from "../shared/database/mongo.js";

export class MongoRepository {
  constructor(private mongo: MongoConnection) {}

  /**
   * Get the collection for a specific workspace
   */
  private getWorkspaceCollection(
    workspaceId: string
  ): Collection<MongoResource> {
    const collectionName = getWorkspaceCollectionName(workspaceId);
    return this.mongo.db.collection<MongoResource>(collectionName);
  }

  /**
   * Save or update a resource
   */
  async saveResource(resource: MongoResource): Promise<void> {
    const collection = this.getWorkspaceCollection(resource.workspaceId);
    await collection.updateOne(
      { _id: resource._id },
      { $set: resource },
      { upsert: true }
    );
  }

  /**
   * Save multiple resources in a batch
   */
  async saveResources(resources: MongoResource[]): Promise<void> {
    if (resources.length === 0) return;

    // Group by workspace
    const byWorkspace = new Map<string, MongoResource[]>();
    for (const resource of resources) {
      const existing = byWorkspace.get(resource.workspaceId) || [];
      existing.push(resource);
      byWorkspace.set(resource.workspaceId, existing);
    }

    // Save to each workspace collection
    await Promise.all(
      Array.from(byWorkspace.entries()).map(([workspaceId, resources]) => {
        const collection = this.getWorkspaceCollection(workspaceId);
        return collection.bulkWrite(
          resources.map((resource) => ({
            updateOne: {
              filter: { _id: resource._id },
              update: { $set: resource },
              upsert: true,
            },
          }))
        );
      })
    );
  }

  /**
   * Find a resource by ID
   */
  async findById(
    workspaceId: string,
    id: string
  ): Promise<MongoResource | null> {
    const collection = this.getWorkspaceCollection(workspaceId);
    return collection.findOne({ _id: id });
  }

  /**
   * Find multiple resources by IDs
   */
  async findByIds(
    workspaceId: string,
    ids: string[]
  ): Promise<MongoResource[]> {
    const collection = this.getWorkspaceCollection(workspaceId);
    return collection.find({ _id: { $in: ids } }).toArray();
  }

  /**
   * Find resources by filter
   */
  async find(
    workspaceId: string,
    filter: Record<string, any>,
    options?: {
      limit?: number;
      skip?: number;
      sort?: Record<string, 1 | -1>;
    }
  ): Promise<MongoResource[]> {
    const collection = this.getWorkspaceCollection(workspaceId);
    let query = collection.find(filter);

    if (options?.skip) query = query.skip(options.skip);
    if (options?.limit) query = query.limit(options.limit);
    if (options?.sort) query = query.sort(options.sort);

    return query.toArray();
  }

  /**
   * Delete a resource
   */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const collection = this.getWorkspaceCollection(workspaceId);
    const result = await collection.deleteOne({ _id: id });
    return result.deletedCount > 0;
  }

  /**
   * Create workspace metadata collection
   */
  async createWorkspace(workspace: Workspace): Promise<void> {
    const collection = this.mongo.db.collection<Workspace>("workspaces");
    await collection.updateOne(
      { _id: workspace._id },
      { $set: workspace },
      { upsert: true }
    );

    // Create the workspace resources collection with indexes
    const resourcesCollection = this.getWorkspaceCollection(workspace._id);
    await resourcesCollection.createIndexes([
      { key: { workspaceId: 1 } },
      { key: { source: 1 } },
      { key: { type: 1 } },
      { key: { primaryDate: -1 } },
      { key: { people: 1 } },
      { key: { indexedAt: -1 } },
    ]);
  }

  /**
   * Get workspace metadata
   */
  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    const collection = this.mongo.db.collection<Workspace>("workspaces");
    return collection.findOne({ _id: workspaceId });
  }

  /**
   * List all workspaces
   */
  async listWorkspaces(): Promise<Workspace[]> {
    const collection = this.mongo.db.collection<Workspace>("workspaces");
    return collection.find({}).toArray();
  }
}
