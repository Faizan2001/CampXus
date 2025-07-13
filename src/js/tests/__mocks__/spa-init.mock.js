// Mock spa-init.js to avoid CSS imports during testing
import { jest } from '@jest/globals';

export const navigateTo = jest.fn();
export const loadPageContent = jest.fn();
export const currentPage = 'home';