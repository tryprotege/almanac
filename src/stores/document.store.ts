import { DocumentModel, IDocument } from "../models/document.model.js";

/**
 * Document Store - Data access layer for documents
 * Uses Mongoose for MongoDB operations
 */
export class DocumentStore {
  /**
   * Save or update a document
   */
  async save(document: Partial<IDocument>): Promise<IDocument> {
    if (document._id) {
      const updated = await DocumentModel.findByIdAndUpdate(
        document._id,
        { $set: document },
        { new: true, upsert: true }
      );
      if (!updated) {
        throw new Error(`Failed to update document ${document._id}`);
      }
      return updated;
    }

    return await DocumentModel.create(document);
  }

  /**
   * Save multiple documents in a batch
   */
  async saveBatch(documents: Partial<IDocument>[]): Promise<IDocument[]> {
    if (documents.length === 0) return [];

    const operations = documents.map((doc) => ({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: doc },
        upsert: true,
      },
    }));

    await DocumentModel.bulkWrite(operations);

    // Return the updated documents
    const ids = documents.map((d) => d._id).filter((id): id is string => !!id);
    return await DocumentModel.find({ _id: { $in: ids } });
  }

  /**
   * Find a document by ID
   */
  async findById(id: string): Promise<IDocument | null> {
    return await DocumentModel.findById(id);
  }

  /**
   * Find multiple documents by IDs
   */
  async findByIds(ids: string[]): Promise<IDocument[]> {
    return await DocumentModel.find({ _id: { $in: ids } });
  }

  /**
   * Find documents by filter
   */
  async find(
    filter: Record<string, any>,
    options?: {
      limit?: number;
      skip?: number;
      sort?: Record<string, 1 | -1>;
    }
  ): Promise<IDocument[]> {
    let query = DocumentModel.find(filter);

    if (options?.skip) query = query.skip(options.skip);
    if (options?.limit) query = query.limit(options.limit);
    if (options?.sort) query = query.sort(options.sort);

    return await query.exec();
  }

  /**
   * Count documents matching filter
   */
  async count(filter: Record<string, any> = {}): Promise<number> {
    return await DocumentModel.countDocuments(filter);
  }

  /**
   * Delete a document by ID
   */
  async deleteById(id: string): Promise<boolean> {
    const result = await DocumentModel.deleteOne({ _id: id });
    return result.deletedCount > 0;
  }

  /**
   * Delete multiple documents by IDs
   */
  async deleteByIds(ids: string[]): Promise<number> {
    const result = await DocumentModel.deleteMany({ _id: { $in: ids } });
    return result.deletedCount;
  }

  /**
   * Full-text search on document content
   */
  async search(
    query: string,
    options?: {
      limit?: number;
      skip?: number;
    }
  ): Promise<IDocument[]> {
    let search = DocumentModel.find({
      $text: { $search: query },
    }).sort({ score: { $meta: "textScore" } });

    if (options?.skip) search = search.skip(options.skip);
    if (options?.limit) search = search.limit(options.limit);

    return await search.exec();
  }

  /**
   * Find documents by source and type
   */
  async findBySource(
    source: string,
    type?: string,
    options?: { limit?: number; skip?: number }
  ): Promise<IDocument[]> {
    const filter: any = { source };
    if (type) filter.type = type;

    return await this.find(filter, options);
  }

  /**
   * Get all unique sources
   */
  async getUniqueSources(): Promise<string[]> {
    return await DocumentModel.distinct("source");
  }

  /**
   * Get all unique types
   */
  async getUniqueTypes(): Promise<string[]> {
    return await DocumentModel.distinct("type");
  }
}
