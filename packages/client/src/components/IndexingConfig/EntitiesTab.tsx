import { GitBranch, Link2 } from "lucide-react";

interface EntitiesTabProps {
  config: any;
}

export default function EntitiesTab({ config }: EntitiesTabProps) {
  const recordTypes = config.recordTypes || {};

  // Collect all entities and relationships from all record types
  const allEntities: Array<{ recordType: string; entity: any }> = [];
  const allRelationships: Array<{ recordType: string; relationship: any }> = [];

  Object.entries(recordTypes).forEach(
    ([typeName, recordType]: [string, any]) => {
      (recordType.entities || []).forEach((entity: any) => {
        allEntities.push({ recordType: typeName, entity });
      });
      (recordType.relationships || []).forEach((relationship: any) => {
        allRelationships.push({ recordType: typeName, relationship });
      });
    }
  );

  return (
    <div className="space-y-6">
      {/* Entities */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Entity Extractions
        </h3>

        {allEntities.length === 0 ? (
          <div className="card text-center py-12">
            <GitBranch className="w-12 h-12 text-text-quaternary mx-auto mb-4" />
            <p className="text-text-tertiary">No entities configured</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border-secondary">
              <thead className="bg-bg-secondary">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    Entity Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    ID Path
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    Title Path
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    Record Type
                  </th>
                </tr>
              </thead>
              <tbody className="bg-bg-primary divide-y divide-border-secondary">
                {allEntities.map(({ recordType, entity }, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-text-primary">
                      {entity.name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className="px-2 py-1 bg-brand-purple/10 border border-brand-purple/30 rounded text-xs text-brand-purple">
                        {entity.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      <code className="text-xs">{entity.idPath}</code>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      <code className="text-xs">{entity.titlePath}</code>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary">
                      {recordType}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Relationships */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Relationship Extractions
        </h3>

        {allRelationships.length === 0 ? (
          <div className="card text-center py-12">
            <Link2 className="w-12 h-12 text-text-quaternary mx-auto mb-4" />
            <p className="text-text-tertiary">No relationships configured</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border-secondary">
              <thead className="bg-bg-secondary">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    Source Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    Target Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    Target ID Path
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    Record Type
                  </th>
                </tr>
              </thead>
              <tbody className="bg-bg-primary divide-y divide-border-secondary">
                {allRelationships.map(({ recordType, relationship }, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-text-primary">
                      {relationship.name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className="px-2 py-1 bg-brand-blue/10 border border-brand-blue/30 rounded text-xs text-brand-blue">
                        {relationship.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary">
                      {relationship.sourceType || recordType}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary">
                      {relationship.targetType}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      <code className="text-xs">
                        {relationship.targetIdPath}
                      </code>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary">
                      {recordType}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Entity Properties */}
      {allEntities.some(({ entity }) => entity.properties) && (
        <div>
          <h3 className="text-lg font-semibold text-text-primary mb-4">
            Entity Properties
          </h3>
          <div className="space-y-3">
            {allEntities
              .filter(({ entity }) => entity.properties)
              .map(({ recordType, entity }, index) => (
                <div key={index} className="card">
                  <h4 className="text-sm font-medium text-text-primary mb-2">
                    {entity.type} ({entity.name})
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(entity.properties).map(
                      ([propName, propPath]: [string, any]) => (
                        <div
                          key={propName}
                          className="px-3 py-2 bg-bg-secondary border border-border-secondary rounded-lg"
                        >
                          <span className="text-text-secondary">
                            {propName}:
                          </span>{" "}
                          <code className="text-xs text-text-primary">
                            {propPath}
                          </code>
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
