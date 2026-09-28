import { MessageCircle } from 'lucide-react';
import { Mascot } from 'page-mascot';

const SwipeChatPrompt = ({ onClick }) => (
  <aside className="swipe-chat-prompt">
    <button type="button" className="swipe-chat-prompt-copy" onClick={onClick}>Cần mình<br />gợi ý không?</button>
    <Mascot
      directions="/mascots/otter-builder-directions.webp"
      reactions="/mascots/otter-builder-reactions.webp"
      size={78}
      label="Rái cá Swipe Nest"
      className="swipe-chat-mascot"
    />
    <button type="button" className="swipe-chat-prompt-button" onClick={onClick} aria-label="Mở chat"><MessageCircle size={22} fill="currentColor" /></button>
  </aside>
);

export default SwipeChatPrompt;
