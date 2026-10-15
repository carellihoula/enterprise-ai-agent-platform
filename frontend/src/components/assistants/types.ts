import { Assistant } from "@/types/assistant";

export interface AssistantCardProps {
  assistant: Assistant;
  isSelected?: boolean;
  onSelect?: (assistant: Assistant) => void;
  onEdit?: (assistant: Assistant) => void;
  onDelete?: (assistant: Assistant) => void;
  onChatWithAssistant?: (assistant: Assistant) => void;
}

export interface AssistantsListViewProps {
  assistants: Assistant[];
  activeAssistantId?: string;
  onSelectAssistant: (assistant: Assistant) => void;
  onCreateAssistant: () => void;
  onEditAssistant: (assistant: Assistant) => void;
  onDeleteAssistant: (assistant: Assistant) => void;
  onChatWithAssistant: (assistant: Assistant) => void;
  isLoading?: boolean;
}
