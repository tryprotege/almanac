import { useState } from 'react';
import { ModelConfiguration } from '../components/ModelConfiguration';
import { PersonaEditor } from '../components/PersonaEditor';
import { PageHeader } from '../components/ui/PageHeader';

type SettingsTab = 'persona' | 'variables';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('persona');

  const tabs = [
    {
      id: 'persona' as SettingsTab,
      label: 'Persona',
    },
    {
      id: 'variables' as SettingsTab,
      label: 'Variables',
    },
  ];

  return (
    <div className="pb-8">
      <PageHeader title="Settings" />

      {/* Horizontal Tabs */}
      <div className="horizontal-tabs mb-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id ? 'active' : ''}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'persona' && <PersonaEditor />}
        {activeTab === 'variables' && <ModelConfiguration />}
      </div>
    </div>
  );
}
