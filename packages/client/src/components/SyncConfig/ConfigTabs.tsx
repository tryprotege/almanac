import { useState } from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface ConfigTabsProps {
  tabs: Tab[];
  children: (activeTab: string) => React.ReactNode;
  defaultTab?: string;
}

export default function ConfigTabs({ tabs, children, defaultTab }: ConfigTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || 'overview');

  return (
    <div className="w-full">
      {/* Tab Headers */}
      <div className="border-b border-border-secondary">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === tab.id
                    ? 'border-brand-purple text-brand-purple'
                    : 'border-transparent text-text-tertiary hover:text-text-secondary hover:border-border-primary'
                }
              `}
            >
              <div className="flex items-center gap-2">
                {tab.icon}
                {tab.label}
              </div>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">{children(activeTab)}</div>
    </div>
  );
}
