import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [ngStyle]="{ backgroundColor: bgColor, color: textColor }"
         class="w-full h-full flex items-center justify-center font-bold text-sm uppercase rounded-full">
      {{ initials }}
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
  `]
})
export class AvatarComponent implements OnChanges {
  @Input() name: string | undefined | null = '';

  initials: string = '';
  bgColor: string = '#ccc';
  textColor: string = '#fff';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['name']) {
      this.generateAvatar();
    }
  }

  private generateAvatar() {
    const nameStr = this.name || '?';
    this.initials = this.getInitials(nameStr);
    this.bgColor = this.stringToColor(nameStr);
  }

  private getInitials(name: string): string {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].substring(0, 2);
    return (parts[0][0] + parts[parts.length - 1][0]);
  }

  private stringToColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
  }
}
